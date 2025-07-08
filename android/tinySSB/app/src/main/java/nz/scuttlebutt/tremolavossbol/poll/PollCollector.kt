package nz.scuttlebutt.tremolavossbol.poll
import nz.scuttlebutt.tremolavossbol.crypto.SSBid
import nz.scuttlebutt.tremolavossbol.tssb.Repo
import nz.scuttlebutt.tremolavossbol.utils.Bipf

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
    private val repo: Repo,      // Access to local replicas and feeds
    private val myId: SSBid      // Identity of the poll creator (used for decryption)
) {

    /**
     * Represents a decrypted vote.
     * @param optionIndex the selected option (as index into the poll's options array)
     * @param from the feed ID (fid) of the peer who cast the vote
     */
    data class DecryptedVote(val optionIndex: Int, val from: ByteArray)

    //TODO, might be inefficient, maybe use dmx tag to indicate new votes. atm iterating over all feed entries
    /**
     * Collects all valid and decryptable votes from known feeds that belong to the given poll.
     *
     * @param pollId the unique ID of the poll to match against
     * @return list of successfully decrypted and parsed votes
     */
    private fun collectVotes(pollId: String): List<DecryptedVote> {
        val collected = mutableListOf<DecryptedVote>()

        for (fid in repo.listFeeds()) {
            val replica = repo.fid2replica(fid) ?: continue
            val maxSeq = replica.state.max_seq

            for (seq in 1 .. maxSeq) {
                val pkt = repo.feed_read_content(fid, seq) ?: continue
                val payload = Bipf.decode(pkt) ?: continue

                // Expecting encrypted vote payload in a BIPF list structure
                if (payload.typ != Bipf.BIPF_LIST || payload.cnt < 1) continue
                val lst = payload.getBipfList()
                val encryptedBytes = lst[0].getBytes()

                // Try decrypting using creator's private key
                val decrypted = try {
                    myId.decryptPrivateMessage(encryptedBytes)
                } catch (_: Exception) {
                    continue // not decryptable by us -> not our vote
                }

                // Attempt to decode the decrypted payload
                if(decrypted == null) continue
                val votePayload = Bipf.decode(decrypted) ?: continue
                if (votePayload.typ != Bipf.BIPF_LIST || votePayload.cnt < 3) continue
                val elems = votePayload.getBipfList()

                val tag = elems[0].getBytes()
                if (!tag.contentEquals(PollCodec.TINYSSB_APP_POLL_VOTE.getBytes())) continue

                val incomingPollId = elems[1].getString()
                if (incomingPollId != pollId) continue

                val optionIndex = elems[2].getInt()
                if (optionIndex == null || optionIndex < 0) continue

                collected.add(DecryptedVote(optionIndex, fid))
            }
        }

        return collected
    }

    //TODO, simple tally without user information no ZKP
    /**
     * Tallies the number of votes per option for a given poll.
     *
     * @param pollId the ID of the poll to tally votes for
     * @param numOptions the number of options in the poll
     * @return a list where each index corresponds to an option and its value is the vote count
     */
    fun tallyVotes(pollId: String, numOptions: Int): List<Int> {
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
