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
 * This forms the basis for vote tallying and later ZKP generation.
 */
class PollCollector(
    private val context: Context,
    private val repo: Repo,                 // Access to local replicas and feeds
    private val myId: SSBid,                // Identity of the poll creator (used for decryption)
    private val voteIndexer: VoteIndexer
) {

    /**
     * Represents a decrypted vote.
     * @param optionIndex the selected option (as index into the poll's options array)
     * @param from the feed ID (fid) of the peer who cast the vote
     */
    data class DecryptedVote(val optionIndex: Int, val from: ByteArray)


    /**
     * Collects all valid and decryptable votes from known feeds that belong to the given poll.
     *
     * @param pollId the unique ID of the poll to match against
     * @return list of successfully decrypted and parsed votes
     */
    private suspend fun collectVotes(pollId: String): List<DecryptedVote> {
        voteIndexer.awaitIdle()
        val collected = mutableListOf<DecryptedVote>()
        val pollDir = File(context.filesDir, "poll_index/$pollId")

        val files = pollDir.listFiles() ?: return collected
        for (file in files) {
            val fidB64 = file.name.removeSuffix(".json")
            val fid = "@$fidB64.ed25519".deRef() ?: continue
            val replica = repo.fid2replica(fid) ?: continue

            val seqs = try {
                JSONArray(file.readText()).let { arr -> List(arr.length()) { arr.getInt(it) } }
            } catch (e: Exception) {
                Log.e("PollCollector", "Invalid index file ${file.name}", e)
                continue
            }

            for (seq in seqs) {
                val pkt = repo.feed_read_content(fid, seq) ?: continue
                val payload = Bipf.decode(pkt) ?: continue
                if (payload.typ != Bipf.BIPF_LIST || payload.cnt < 1) continue
                val lst = payload.getBipfList()
                val encryptedBytes = lst[0].getBytes()

                val decrypted = try {
                    myId.decryptPrivateMessage(encryptedBytes)
                } catch (_: Exception) {
                    continue
                } ?: continue

                val votePayload = Bipf.decode(decrypted) ?: continue
                if (votePayload.typ != Bipf.BIPF_LIST || votePayload.cnt < 3) continue
                val elems = votePayload.getBipfList()

                val tag = elems[0].getBytes()
                if (!tag.contentEquals(PollCodec.TINYSSB_APP_POLL_VOTE.getBytes())) continue

                val incomingPollId = elems[1].getString()
                if (incomingPollId != pollId) continue

                val optionIndex = elems[2].getInt()
                if (optionIndex < 0) continue

                collected.add(DecryptedVote(optionIndex, fid))
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
            if (vote.optionIndex in 0 until numOptions) {
                counts[vote.optionIndex]++
            }
        }

        return counts
    }
}
