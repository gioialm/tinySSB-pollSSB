package nz.scuttlebutt.tremolavossbol.poll

import android.util.Log
import nz.scuttlebutt.tremolavossbol.utils.Bipf
import java.util.UUID

//TODO, this is only a skeleton not a finished implementation. No usages yet.
/**
 * PollProtocol contains functions for encoding, decoding and storing of polls
 * and votes in TinySSB using the bipf.
 */
object PollCodec {

    // tags for poll related messages
    val TINYSSB_APP_POLL = Bipf.mkString("POL")       // New Poll
    val TINYSSB_APP_POLL_VOTE = Bipf.mkString("POV")  // Vote
    val TINYSSB_APP_POLL_RESULT = Bipf.mkString("POR")// (Optional) Poll result with ZKP

    /**
     * Data class, which describes a poll
     * @param id Unique identifier of the poll
     * @param question The question for the poll
     * @param options Answer option list
     */
    data class Poll(
        val id: String,
        val question: String,
        val options: List<String>
    )

    /**
     * Data class, which describes a vote
     * @param pollId Poll ID reference
     * @param optionIndex Index of the answer
     * @param optionAnswer True: if ticked, False: if unticked
     */
    data class Vote(
        val pollId: String,
        val answers: IntArray
    )

    /**
     * Creates a new unique poll ID
     */
    fun generatePollId(): String = UUID.randomUUID().toString().replace("-", "")

    /**
     * Encodes a vote instance as BIPF ByteArray
     */
    fun encodeVote(vote: Vote): ByteArray? {
        val lst = Bipf.mkList()
        Bipf.list_append(lst, TINYSSB_APP_POLL_VOTE) // Tag
        Bipf.list_append(lst, Bipf.mkString(vote.pollId))
        val voteBits = Bipf.mkList()
        for (i in 0 until vote.answers.size) {
            Bipf.list_append(voteBits, Bipf.mkInt(vote.answers[i]))
        }
        Bipf.list_append(lst, voteBits)
        return Bipf.encode(lst)
    }

    /**
     * Decodes a BIPF ByteArray to a vote instance
     */
    fun decodeVote(encoded: ByteArray): Vote? {
        try {
            val root = Bipf.decode(encoded) ?: return null

            if (root.typ != Bipf.BIPF_LIST) {
                Log.e("decodeVote", "Root is not a BIPF list")
                return null
            }

            val items = root.getBipfList()
            if (items.size < 2) {
                Log.e("decodeVote", "Vote list has insufficient items: ${items.size}")
                return null
            }

            val tag = items[0]
            if (tag.getString() != TINYSSB_APP_POLL_VOTE.getString()) {
                Log.e("decodeVote", "Invalid vote tag: ${tag.getString()}")
                return null
            }

            val pollId = items[1].getString()

            val answersList = items[2]
            if (answersList.typ != Bipf.BIPF_LIST) {
                Log.e("decodeVote", "Answers is not a list")
                return null
            }

            val answersBipf = answersList.getBipfList()
            val answers = IntArray(answersBipf.size) { i -> answersBipf[i].getInt() }

            return Vote(pollId, answers)
        } catch (e: Exception) {
            Log.e("decodeVote", "Error decoding vote: ${e.message}", e)
            return null
        }
    }
}
