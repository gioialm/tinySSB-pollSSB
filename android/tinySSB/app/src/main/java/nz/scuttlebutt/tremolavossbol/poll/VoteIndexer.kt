
package nz.scuttlebutt.tremolavossbol.poll

import android.content.Context
import android.util.Log
import kotlinx.coroutines.*
import nz.scuttlebutt.tremolavossbol.utils.Bipf
import nz.scuttlebutt.tremolavossbol.utils.HelperFunctions.Companion.toBase64
import org.json.JSONArray
import java.io.File
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Represents a reference to a vote that should be indexed.
 */
data class VoteReference(val pollId: String, val fid: ByteArray, val seq: Int)

/**
 * VoteIndexer is responsible for asynchronously writing vote references
 * (pollId, fid, seq) into files under context.filesDir/poll_index/{pollId}/{fid}.json
 */
class VoteIndexer(private val context: Context) {
    private val POLL_PATH = "poll_index/"
    private val queue = ConcurrentLinkedQueue<VoteReference>()
    private val scope = CoroutineScope(Dispatchers.IO)
    private val isRunning = AtomicBoolean(false)
    private var indexerJob: Job? = null

    fun start() {
        if (isRunning.get()) return
        isRunning.set(true)
        indexerJob = scope.launch {
            runIndexerLoop()
        }
    }

    fun stop() {
        isRunning.set(false)
        indexerJob?.cancel()
    }

    fun isIdle(): Boolean {
        return queue.isEmpty()
    }

    suspend fun awaitIdle() {
        while (!queue.isEmpty()) {
            delay(50)
        }
    }

    /**
     * Asynchronously checks whether a given feed entry is a poll vote (TINYSSB_APP_POLL_VOTE),
     * and if so, stores a reference to it in the background index for later tallying.
     *
     * This function is intended to be called on each incoming feed entry, but runs in a coroutine
     * to avoid blocking decryption or file I/O on the main thread.
     *
     * @param fid The feed ID of the peer who sent the entry.
     * @param seq The sequence number of the entry within that feed.
     * @param content The full BIPF-encoded packet content.
     * @param decrypt A function that takes the encrypted vote payload and returns the decrypted bytes,
     *                or null if the message is not decryptable (e.g., not intended for this peer).
     *
     * Only decryptable and well-structured poll vote messages will be indexed.
     */

    fun checkAndStoreIfPollVote(fid: ByteArray, seq: Int, content: ByteArray, decrypt: (ByteArray) -> ByteArray?) {
        try {
            Log.d("VoteIndexer", "checkAndStoreIfPollVote")
            val bodyBytes = Bipf.decode(content)
            if (bodyBytes == null) {
                Log.d("VoteIndexer", "decoded bodyList is empty")
                return
            }
            val clear = decrypt(bodyBytes.getBytes())
            if (clear != null) {
                Log.d("VoteIndexer", "Decrypting body successful")
                val vote = PollCodec.decodeVote(clear)
                if (vote == null){
                    Log.d("VoteIndexer", "PollCodec didn't encode a vote")
                    return
                }
                enqueue(VoteReference(vote.pollId, fid, seq))
            }

        } catch (e: Exception) {
            Log.e("VoteIndexer", "Failed to check packet", e)
        }
    }

    fun enqueue(reference: VoteReference) {
        Log.d(
            "VoteIndexer",
            "Enqueuing vote for pollId='${reference.pollId}', fid=${reference.fid.toBase64()}, seq=${reference.seq}"
        )
        queue.add(reference)
    }

    fun clearIndex() {
        try {
            val pollIndexDir = File(context.filesDir, POLL_PATH)
            if (pollIndexDir.exists()) {
                pollIndexDir.deleteRecursively()
                Log.d("VoteIndexer", "Cleared all poll index files and folders")
            } else {
                Log.d("VoteIndexer", "No poll index directory found to clear")
            }
        } catch (e: Exception) {
            Log.e("VoteIndexer", "Failed to clear poll index", e)
        }
    }

    private suspend fun runIndexerLoop() {
        while (isRunning.get()) {
            if (queue.isEmpty()) {
                delay(1000) // Sleep while idle
                continue
            }

            val batch = mutableListOf<VoteReference>()
            while (!queue.isEmpty()) {
                queue.poll()?.let { batch.add(it) }
            }

            for (ref in batch) {
                writeToFile(ref)
            }
        }
    }

    private fun writeToFile(ref: VoteReference) {
        try {
            Log.d("VoteIndexer", "trying to write to file")
            val pollDir = File(context.filesDir, POLL_PATH + ref.pollId)
            pollDir.mkdirs()
            val fidB64 = ref.fid.toBase64().replace("/", "_") // safe filename
            val file = File(pollDir, "$fidB64.json")

            val seqs = if (file.exists()) {
                JSONArray(file.readText()).let { arr ->
                    val list = mutableSetOf<Int>()
                    for (i in 0 until arr.length()) {
                        list.add(arr.getInt(i))
                    }
                    list
                }
            } else {
                mutableSetOf()
            }

            if (ref.seq !in seqs) {
                seqs.add(ref.seq)
                file.writeText(JSONArray(seqs.toList().sorted()).toString())
                Log.d("VoteIndexer", "Indexed vote: ${ref.pollId} → ${ref.fid.toBase64()} seq=${ref.seq}")
            }
        } catch (e: Exception) {
            Log.e("VoteIndexer", "Failed to write vote index", e)
        }
    }
}
