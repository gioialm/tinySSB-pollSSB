package nz.scuttlebutt.tremolavossbol.poll
import android.content.Context
import android.util.Log
import nz.scuttlebutt.tremolavossbol.crypto.SSBid
import nz.scuttlebutt.tremolavossbol.tssb.Repo
import nz.scuttlebutt.tremolavossbol.utils.Bipf
import nz.scuttlebutt.tremolavossbol.utils.HelperFunctions.Companion.deRef
import org.json.JSONArray
import java.io.File

/**
 * PollCollector is responsible for retrieving and decrypting votes for a specific poll.
 * It scans all known feeds and attempts to identify vote entries that are:
 * - Encrypted for the creator
 * - Linked to the given pollId
 * - Properly structured and decodable via BIPF
 *
 * This forms the basis for vote tallying.
 */
class PollCollector(
    private val context: Context,
    private val repo: Repo,                 // Access to local replicas and feeds
    private val myId: SSBid,                // Identity of the poll creator (used for decryption)
    private val voteIndexer: VoteIndexer
) {
    val decrypt: (ByteArray) -> ByteArray? = myId::decryptPrivateMessage

    /**
     * Collects all valid and decryptable votes from known feeds that belong to the given poll.
     *
     * @param pollId the unique ID of the poll to match against
     * @return list of successfully decrypted and parsed votes
     */
    private suspend fun collectVotes(pollId: String): List<PollCodec.Vote> {
        voteIndexer.awaitIdle()
        Log.d("PollCollector", "in collectVotes")
        val collected = mutableListOf<PollCodec.Vote>()
        Log.d("PollCollector", "pollID: $pollId")
        val pollDir = File(context.filesDir, "poll_index/${pollId.replace("/", "_")}")

        val files = pollDir.listFiles() ?: return collected
        for (file in files) {
            val fidB64 = file.name.removeSuffix(".json").replace("_", "/")
            val fid = "@$fidB64.ed25519".deRef()
            Log.d("PollCollector", "fid extracted: $fid")

            val seqs = try {
                JSONArray(file.readText()).let { arr -> List(arr.length()) { arr.getInt(it) } }
            } catch (e: Exception) {
                Log.e("PollCollector", "Invalid index file ${file.name}", e)
                continue
            }

            if (seqs.isEmpty()) continue
            val seq = seqs.first()

            val pkt = repo.feed_read_content(fid, seq) ?: continue
            val bodyBytes = Bipf.decode(pkt)
            if (bodyBytes == null) {
                Log.d("PollCollector", "decoded bodyList is empty")
                continue
            }
            if (bodyBytes.typ != Bipf.BIPF_BYTES) {
                Log.d("PollCollector", "")
            }
            val clear = decrypt(bodyBytes.getBytes())
            if (clear != null) {
                Log.d("PollCollector", "Decrypting body successful")
                val vote = PollCodec.decodeVote(clear)
                if (vote == null) {
                    Log.d("PollCollector", "PollCodec didn't encode a vote")
                    continue
                }
                collected.add(vote)
            }
        }

        return collected
    }

    //TODO ZKP proving correct tally
    /**
     * Tallies the number of votes per option for a given poll.
     *
     * @param pollId the ID of the poll to tally votes for
     * @param numOptions the number of options in the poll
     * @return a list where each index corresponds to an option and its value is the vote count
     */
    suspend fun tallyVotes(pollId: String, numOptions: Int): List<Int> {
        val votes = collectVotes(pollId)
        val counts = MutableList(numOptions) { 0 }

        for (vote in votes) {
            for (i in 0 until numOptions) {
                if (vote.answers[i] == 1) {
                    Log.d("PollCollector", "$vote, answer $i is ${vote.answers[i]}")
                    counts[i] += 1
                    Log.d("PollCollector", "counts at position $i increased to ${counts[i]}")
                }
            }
        }

        return counts
    }
}
