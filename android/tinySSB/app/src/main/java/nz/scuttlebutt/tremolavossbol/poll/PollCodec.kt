package nz.scuttlebutt.tremolavossbol.poll

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
        val optionIndex: Int,
        val optionAnswer: Boolean
    )

    //TODO
    /**
     * Creates a new unique poll ID
     */
    fun generatePollId(): String = UUID.randomUUID().toString()

    /**
     * Encodes a poll object to BIPF format for storing in feed
     */
    fun encodePoll(poll: Poll): ByteArray? {
        val lst = Bipf.mkList()
        Bipf.list_append(lst, TINYSSB_APP_POLL) // Tag
        Bipf.list_append(lst, Bipf.mkString(poll.id))
        Bipf.list_append(lst, Bipf.mkString(poll.question))
        val optList = Bipf.mkList()
        for (opt in poll.options) {
            Bipf.list_append(optList, Bipf.mkString(opt))
        }
        Bipf.list_append(lst, optList)
        return Bipf.encode(lst)
    }

    /**
     * Encodes a vote instance as BIPF ByteArray
     */
    fun encodeVote(vote: Vote): ByteArray? {
        val lst = Bipf.mkList()
        Bipf.list_append(lst, TINYSSB_APP_POLL_VOTE) // Tag
        Bipf.list_append(lst, Bipf.mkString(vote.pollId))
        Bipf.list_append(lst, Bipf.mkInt(vote.optionIndex))
        Bipf.list_append(lst, Bipf.mkBool(vote.optionAnswer))
        return Bipf.encode(lst)
    }

    /**
     * Decodes a BIPF ByteArray to a poll instance
     */
    fun decodePoll(payload: ByteArray): Poll? {
        val root = Bipf.decode(payload) ?: return null
        if (root.typ != Bipf.BIPF_LIST || root.cnt < 4) return null
        val elems = root.getBipfList()
        if (!elems[0].getBytes().contentEquals(TINYSSB_APP_POLL.getBytes())) return null
        val id = elems[1].getString()
        val question = elems[2].getString()
        val optsRaw = elems[3]
        val opts = optsRaw.getBipfList().map { it.getString() }
        return Poll(id, question, opts)
    }

    /**
     * Decodes a BIPF ByteArray to a vote instance
     */
    fun decodeVote(payload: ByteArray): Vote? {
        val root = Bipf.decode(payload) ?: return null
        if (root.typ != Bipf.BIPF_LIST || root.cnt < 3) return null
        val elems = root.getBipfList()
        if (!elems[0].getBytes().contentEquals(TINYSSB_APP_POLL_VOTE.getBytes())) return null
        val pollId = elems[1].getString()
        val index = elems[2].getInt()
        val answer = elems[3].getBoolean()
        return Vote(pollId, index, answer)
    }
}
