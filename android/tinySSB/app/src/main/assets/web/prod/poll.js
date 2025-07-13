let currentPollId = null;
let selectedOption = null;
let currentPollCreator = null;
let optionsInCurrentPoll = [];
let currentResultMessage = null;
MIN_OPTIONS = 2; // minimum allowed options
MAX_OPTIONS = 5; // maximum allowed options
let pollOptionCounter = 0; // tracks how many polls have ever been added, for unique IDs
let pollOptionsMap = {};

/**
 * open_poll_creator()
 *
 * Opens a poll creation overlay on the screen if not already open. The new poll has a question
 * and the minimum amount of options by default. Allows the user to add and remove options in the
 * boundaries and provides submit and cancel buttons.
 */
function open_poll_creator() {
    const overlay = document.getElementById('poll-creator-menu');
    const overlayBg = document.getElementById('overlay-bg')
    if (!overlay || !overlayBg) return;

    pollOptionCounter = 0;

    overlay.innerHTML = `
    <div style="text-align: center;">
        <h3>Create a New Poll</h3>
        <input type="text" id="poll-question" placeholder="Question" style="width: 90%; margin: 10px 0;"><br>

        <div id="poll-options-container"></div>
                <button onclick="add_poll_option()" style="margin: 10px;">➕ Add Option</button>

        <div style="margin-top: 20px;">
            <button class="passive buttontext" onclick="submit_poll_creator()" style="background-image: url('img/checked.svg'); background-repeat: no-repeat; width: 35px; height: 35px;"></button>
            <button class="passive buttontext" onclick="closeOverlay()" style="background-image: url('img/cancel.svg'); background-repeat: no-repeat; width: 35px; height: 35px;"></button>
        </div>
    </div>
    `;

    overlay.style.display = 'block';
    requestAnimationFrame(() => overlay.classList.add('show'));
    overlayBg.style.display = 'initial';
    overlayBg.onclick = () => closeOverlay();
    overlayIsActive = true;

    for (let i = 0; i < MIN_OPTIONS; i++) {
        add_poll_option();
    }
}

/**
 * submit_poll_creator()
 *
 * Gathers the question and poll options from the input fields, validates them, and sends the poll
 * data to the backend. Requires the options and the question fields to be filled. Adds
 * location metadata if available. Encodes the data and sends command to backend on whether
 * the chat is public or private. Closes the overlay and shows a confirmation snackbar on success.
 */
function submit_poll_creator() {
    const question = document.getElementById('poll-question')?.value;
    const options = get_current_poll_options();

    if (!is_poll_filled(question, options)) {
        launch_snackbar("Please fill in all fields.");
        return;
    }

    const pollData = {
        type: "poll:create",
        question: question,
        options: options
    };

    const payload = encode_poll_payload(pollData);
    const command = build_poll_command(payload);

    backend(command);
    closeOverlay();
    launch_snackbar("Poll created successfully");
}

function openVoteModal(pollId, pollText, creatorID) {
    console.log("Poll: Opening vote modal for poll:", pollId, "creator:", creatorID);
    currentPollId = pollId;
    currentPollCreator = creatorID;
    selectedOption = null;


    const lines = pollText.split("<br>\n");
    const question = lines[0].replace("📊 Poll: ", "").trim();

    optionsInCurrentPoll = lines.slice(1).map(line => line.replace("[ ]", "").trim());

    document.getElementById("voteQuestion").innerText = question;

    const optContainer = document.getElementById("voteOptions");
    optContainer.innerHTML = "";
    optionsInCurrentPoll.forEach(opt => {
        const id = "opt-" + opt.replace(/\s/g, "_");
        optContainer.innerHTML += `
            <div style="margin: 5px 0;">
                <input type="radio" id="${id}" name="pollOption" value="${opt}" onchange="selectedOption = this.value;">
                <label for="${id}" style="margin-left: 5px;">${opt}</label>
            </div>`;
    });

    document.getElementById("voteModal").style.display = "block";
}


function closeVoteModal() {
    document.getElementById("voteModal").style.display = "none";
}

function submitVote() {
    console.log("Poll: In submitVote, PollID:", currentPollId, "creator:", currentPollCreator);

    if (selectedOption === null) {
        launch_snackbar("Please select an option");
        return;
    }

    if (!currentPollId || !currentPollCreator) {
        alert("Missing poll context");
        return;
    }

    // Prevent multiple votes in frontend
    if (!window.votedPolls) window.votedPolls = {};
    if (window.votedPolls[currentPollId]) {
        launch_snackbar("You have already voted on this poll");
        return;
    }
    window.votedPolls[currentPollId] = true;

    // Build a binary array for all options, with 1 at selected index
    const voteArray = optionsInCurrentPoll.map(opt => opt === selectedOption ? 1 : 0);

    // Use BIPF-like vote message format
    const bipfVotePayload = ["POV", currentPollId, voteArray];

    const encodedPayload = btoa(JSON.stringify(bipfVotePayload));

    const ch = tremola.chats[curr_chat];
    if (!(ch.timeline instanceof Timeline)) {
        ch.timeline = Timeline.fromJSON(ch.timeline);
    }
    const tips = JSON.stringify(ch.timeline.get_tips());

    const cmd = `poll:vote ${tips} ${encodedPayload} null ${currentPollCreator}`;
    backend(cmd);
    console.log("Poll: Sent cmd to backend:", cmd);


    closeVoteModal();
    launch_snackbar("Your vote has been sent.");
}


function openResultsModal(pollId) {
    console.log("Opening results for poll:", pollId);

    /* Uncomment hardcoded results for testing
    const question = "Do you want to go on holiday?";
    const results = [
        { option: "Yes", votes: 5 },
        { option: "No", votes: 0 }
    ];

    const resultsHtml = results.map(r =>
        `<p>${r.votes > 0 ? '✅' : '❌'} <b>${r.option}</b> — ${r.votes} vote${r.votes !== 1 ? 's' : ''}</p>`
    ).join("");

    const textSummary = `Results for: ${question}\n` +
        results.map(r => `${r.option}: ${r.votes} vote${r.votes !== 1 ? 's' : ''}`).join('\n');

    currentResultMessage = textSummary;
    */

    const question = "No results yet";
    const resultsHtml = `<p style="color: gray;">Tallying in progress or no votes received yet.</p>`;

    document.getElementById("resultsTitle").innerText = question;
    document.getElementById("resultsBody").innerHTML = resultsHtml;

    document.getElementById("resultsModal").style.display = "block";
}


function sendPollResults() {
    if (!currentResultMessage) {
        launch_snackbar("Nothing to send");
        return;
    }

    const encodedText = btoa(currentResultMessage);

    const ch = tremola.chats[curr_chat];
    if (!(ch.timeline instanceof Timeline)) {
        ch.timeline = Timeline.fromJSON(ch.timeline);
    }

    const tips = JSON.stringify(ch.timeline.get_tips());

    let cmd;
    if (curr_chat === "ALL") {
        cmd = `publ:post ${tips} ${encodedText} null`;
    } else {
        const recps = ch.members.join(' ');
        cmd = `priv:post ${tips} ${encodedText} null ${recps}`;
    }

    backend(cmd);
    closeResultsModal();
    launch_snackbar("Results sent");
}

/**
    sends a tally request to the backend.
*/
function requestVoteTallying() {
        backend(`poll:tally ${currentPollId} ${optionsInCurrentPoll.length}`);
        launch_snackbar("Tally requested");
}

/** called from the backend to
*/

function b2f_showPollTally(pollId, countsArray) {
    console.log("Received poll results for", pollId, countsArray);
    if (!Array.isArray(countsArray) || countsArray.length !== optionsInCurrentPoll.length) {
            launch_snackbar("Mismatch in poll results");
            return;
    }

    const question = document.getElementById("voteQuestion").innerText;
        const resultsHtml = optionsInCurrentPoll.map((option, index) => {
            const votes = countsArray[index] || 0;
            const icon = votes > 0 ? "✅" : "❌";
            return `<p>${icon} <b>${option}</b> — ${votes} vote${votes !== 1 ? 's' : ''}</p>`;
        }).join("");

        const textSummary = `Results for: ${question}\n` +
            optionsInCurrentPoll.map((opt, idx) => `${opt}: ${countsArray[idx]} vote${countsArray[idx] !== 1 ? 's' : ''}`).join("\n");

        currentResultMessage = textSummary;

        document.getElementById("resultsTitle").innerText = question;
        document.getElementById("resultsBody").innerHTML = resultsHtml;
        document.getElementById("resultsModal").style.display = "block";

}

function closeResultsModal() {
    document.getElementById("resultsModal").style.display = "none";
}


/**
 * add_poll_option()
 *
 * Adds a new input field for a poll option. Each option is labeled with a placeholder. Prevents
 * exceeding the maximum. Renumbers placeholders to ensure uniqueness.
 */
function add_poll_option() {
    if (get_current_poll_option_count() >= MAX_OPTIONS) {
        launch_snackbar("The poll can have at most " + MAX_OPTIONS + " options.");
        return;
    }

    pollOptionCounter++;
    const optionId = `poll-option-${pollOptionCounter}`;
    const optionDiv = document.createElement('div');
    optionDiv.id = `poll-opt-div-${pollOptionCounter}`;
    optionDiv.style.margin = "5px";

    optionDiv.innerHTML = `
        <input type="text" id="${optionId}" placeholder="Option ${get_current_poll_option_count() + 1}" style="width: 80%;" />
        <button onclick="remove_poll_option('${optionDiv.id}')" style="margin-left: 5px;">❌</button>
    `;

    const container = document.getElementById('poll-options-container');
    container.appendChild(optionDiv);
    renumber_poll_option_placeholders();
}

/**
 * remove_poll_option(id)
 *
 * Removes a poll option input field by its container ID.
 * Prevents removing below the minimum. Renumbers placeholders to ensure uniqueness.
 *
 * @param {string} id - The DOM element ID of the poll option container to remove.
 */
function remove_poll_option(id) {
    if (get_current_poll_option_count() <= MIN_OPTIONS) {
        launch_snackbar("A poll must have at least " + MIN_OPTIONS +" options.");
        return;
    }

    const option = document.getElementById(id);
    if (option) option.remove();

    renumber_poll_option_placeholders();
}

/**
 * get_current_poll_option_count()
 *
 * Counts and returns the number of currently visible poll option input fields in the DOM.
 *
 * @returns {number} The current number of poll option inputs.
 */
function get_current_poll_option_count() {
    return document.querySelectorAll('#poll-options-container input[type="text"]').length;
}

/**
 * get_current_poll_options()
 *
 * Collects and returns all non-empty poll option values from the UI.
 *
 * @returns {string[]} Array of poll option texts entered by the user.
 */
function get_current_poll_options() {
    const inputs = document.querySelectorAll('#poll-options-container input[type="text"]');
    return Array.from(inputs)
        .map(input => input.value.trim())
        .filter(text => text.length > 0);
}

/**
 * is_poll_filled(question, options)
 *
 * Validates that the poll question is non-empty and all options are filled and that no option is
 * only whitespace.
 *
 * @param {string} question - The poll question to validate.
 * @param {string[]} options - The list of poll options to validate.
 * @returns {boolean} - True if the question and all options are properly filled, false otherwise.
 */
function is_poll_filled(question, options) {
    if (!question || !Array.isArray(options)) return false;
    return options.every(opt => typeof opt === 'string' && opt.trim().length > 0);
}

/**
 * renumber_poll_option_placeholders()
 *
 * Renames all poll option input placeholders in order, based on their current position in the DOM.
 */
function renumber_poll_option_placeholders() {
    const inputs = document.querySelectorAll('#poll-options-container input[type="text"]');
    inputs.forEach((input, index) => { input.placeholder = `Option ${index + 1}`; });
}

/**
 * encode_poll_payload(pollData)
 *
 * Serializes and base64-encodes poll data. Optionally includes geolocation prefix if location
 * sharing is enabled and a valid Plus Code is available.
 *
 * @param {Object} pollData - The poll object to encode.
 * @returns {string} - String of the serialized poll data, with prefix.
 */
function encode_poll_payload(pollData) {
    let payload = '';
    if (Android.isGeoLocationEnabled() === "true") {
        const plusCode = Android.getCurrentLocationAsPlusCode();
        if (plusCode && plusCode.length > 0) {
            payload += "pfx:loc/plus," + plusCode + "|";
        }
    }
    payload += JSON.stringify(pollData);
    return btoa(payload);
}

/**
 * build_poll_command(encodedPayload)
 *
 * Constructs the appropriate backend command for sending a poll, depending on whether the
 * chat is public or private. Includes chat tips and recipients.
 *
 * @param {string} encodedPayload - The base64-encoded poll data.
 * @returns {string} - The backend command string to submit the poll.
 */
function build_poll_command(encodedPayload) {
    const ch = tremola.chats[curr_chat];
    if (!(ch.timeline instanceof Timeline)) {
        ch.timeline = Timeline.fromJSON(ch.timeline);
    }
    const tips = JSON.stringify(ch.timeline.get_tips());

    if (curr_chat === "ALL") {
        return `publ:poll ${tips} ${encodedPayload} null`;
    } else {
        const recps = ch.members.join(" ");
    return `priv:poll ${tips} ${encodedPayload} null ${recps}`;
    }
}