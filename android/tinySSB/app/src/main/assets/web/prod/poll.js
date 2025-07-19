// --- Global Variables ---
let currentQuestion = null;
let currentPollId = null;
let selectedOption = null;
let currentPollCreator = null;
let optionsInCurrentPoll = [];
let currentResultMessage = null;
MIN_OPTIONS = 2; // minimum allowed options
MAX_OPTIONS = 5; // maximum allowed options
let pollOptionCounter = 0; // tracks how many polls have ever been added, for unique IDs
let pollOptionsMap = {};
let closedPolls = {}; // key = pollId, value = true if closed

// --- Poll Creator ---
/**
 * open_poll_creator()
 *
 * Closes all overlays and opens a poll-creation-menu on the screen. Contains fields for question
 * and adds the minimum amount of options (MIN_OPTIONS) by default aswell as "add option",
 * "accept" and "decline" buttons. For each option there is a button to remove the it.
 */
function open_poll_creator() {
    closeOverlay();
    const overlay = document.getElementById('poll-creator-menu');
    const overlayBg = document.getElementById('overlay-bg')
    if (!overlay || !overlayBg) return;

    pollOptionCounter = 0;

    overlay.innerHTML = `
    <div id="poll-creator-menu" style="text-align: center;">
        <h3>Create a New Poll</h3>
        <input type="text" id="poll-question" placeholder="Question" style="width: 91%; margin: 10px 0;"><br>

        <div id="poll-options-container"></div>
                <button onclick="add_poll_option()" style="margin: 10px;">➕ Add Option</button>

        <div style="margin-top: 10px;">
            <button class="passive buttontext" onclick="submit_poll_creator()" style="background-image: url('img/accept.svg'); background-size: 90%; background-position: center; background-repeat: no-repeat; width: 40px; height: 40px;"></button>
            <button class="passive buttontext" onclick="closeOverlay()" style="margin-left: 10px; background-image: url('img/decline.svg'); background-size: 90%; background-position: center; background-repeat: no-repeat; width: 40px; height: 40px;"></button>
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
 * data to the backend. Requires the displayed options and the question fields to be filled. Each
 * option are normalized (lowercase and leading whitespaces removed) and must be unique.
 * Sends encoded data to backend and closes all overlays.
 */
function submit_poll_creator() {
    const question = document.getElementById('poll-question')?.value;
    const options = get_current_poll_options();

    if (!is_poll_uniquely_filled(question, options)) {
        launch_snackbar("Please fill in all fields uniquely.");
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
}

// --- Poll Voter ---
/**
 * open_poll_voter(pollId, pollText, creatorID)
 *
 * Renders the poll voting overlay with the question and available options.
 * Options are parsed from the chat message content. Displays all selectable options and a decline
 * and accept button. If poll is already closed it opens the results.
 *
 * @param {string} pollId - Unique key of the poll message.
 * @param {string} pollText - The full poll message body (HTML with <br> lines).
 * @param {string} creatorID - Unique key of the creator of the poll.
 */
function open_poll_voter(pollId, pollText, creatorID) {
    closeOverlay();
    const overlay = document.getElementById('poll-voter-menu');
    const overlayBg = document.getElementById("overlay-bg");
    if (!overlay || !overlayBg) return;

    currentPollId = pollId;
    currentPollCreator = creatorID;
    selectedOption = null;
    const { question, options } = parse_poll_text(pollText);
    optionsInCurrentPoll = options;

    const sentResults = JSON.parse(localStorage.getItem("sentResults") || "{}");
    const isClosed = sentResults[pollId];

    if (isClosed) {
        open_poll_result(pollId, pollText);
        return;
    } else {
        let html = `
            <div id="poll-voter-menu" style="text-align:center">
                <h3>${escapeHTML(question)}</h3>
                <div id="poll-voter-options" style="background:white; text-align: left; display: inline-block;">
                    ${options.map((opt, i) => `
                        <div style="padding: 2px">
                            <input type="radio" name="pollOption" value="${opt}" onchange="selectedOption = this.value;">
                            <label for="opt-${opt.replace(/\s/g, "_")}" style="margin-left: 10px;">${escapeHTML(opt)}</label>
                        </div>
                    `).join("")}
                </div>
                <div style="margin-top: 20px;">
                ${creatorID === myId ? `
                    <button class="passive buttontext" onclick="open_poll_closer('${pollId}',\`${escapeBackticks(pollText)}\`)"
                        style="background-image: url('img/poll.svg'); margin-right: 10px; background-position: center; background-size: 90%; background-repeat: no-repeat; width: 40px; height: 40px;"></button>
                ` : ''}
                <button class="passive buttontext" onclick="submit_poll_voter('${pollId}')"
                    style="background-image: url('img/accept.svg'); background-position: center; background-size: 90%; background-repeat: no-repeat; width: 40px; height: 40px;"></button>
                <button class="passive buttontext" onclick="closeOverlay()"
                    style="background-image: url('img/decline.svg'); margin-left: 10px; background-position: center; background-size: 90%;background-repeat: no-repeat; width: 40px; height: 40px;"></button>
                </div>
            </div>
        `

        overlay.innerHTML = html;
        overlay.style.display = 'block';
        requestAnimationFrame(() => overlay.classList.add('show'));
        overlayBg.style.display = 'initial';
        overlayBg.onclick = () => closeOverlay();
        overlayIsActive = true;
    }
}

/**
 * submit_poll_voter()
 *
 * Checks if a valid selection on a valid poll is made. Prevents double-vote and then sends the
 * vote to the backend.
 */
function submit_poll_voter() {
    if (selectedOption === null) {
        launch_snackbar("Please select an option");
        return;
    }

    if (!currentPollId || !currentPollCreator) {
        alert("Missing poll context");
        return;
    }

    const votedPolls = JSON.parse(localStorage.getItem("votedPolls") || "{}");
    const sentResults = JSON.parse(localStorage.getItem("sentResults") || "{}");
    if (votedPolls[currentPollId]) {
        launch_snackbar("You have already voted on this poll");
        return;
    }

    votedPolls[currentPollId] = true;
    localStorage.setItem("votedPolls", JSON.stringify(votedPolls));
    localStorage.setItem(`pollVote:${currentPollId}`, selectedOption);
    console.log("Vote recorded for", currentPollId);

    const voteArray = optionsInCurrentPoll.map(opt => opt === selectedOption ? 1 : 0);
    const bipfVotePayload = ["POV", currentPollId, voteArray];
    const encodedPayload = btoa(JSON.stringify(bipfVotePayload));
    const command = build_vote_command(encodedPayload);

    backend(command);
    console.log("Poll: Sent command to backend:", command);
    updatePollSubtitle(currentPollId);

    closeOverlay();
    overlayIsActive = false;
    selectedOption = null;
}

function open_poll_viewer(pollId, pollText, creatorId) {
    closeOverlay();
    const overlay = document.getElementById('poll-viewer-menu');
    const overlayBg = document.getElementById("overlay-bg");
    if (!overlay || !overlayBg) return;

    currentPollId = pollId;
    currentPollCreator = creatorId;
    const { question, options } = parse_poll_text(pollText);
    optionsInCurrentPoll = options;
    currentQuestion = question;

    const votedPolls = JSON.parse(localStorage.getItem("votedPolls") || "{}");
    const userVoted = votedPolls[pollId];

    const userSelection = localStorage.getItem(`pollVote:${pollId}`);
    if (!userSelection && !userVoted) {
        launch_snackbar("You have not voted on this poll.");
        return;
    }

    let html = `
        <div id="poll-viewer-menu" style="text-align:center">
            <h3>${escapeHTML(question)}</h3>
            <div style="background:white; text-align: left; display: inline-block;">
                ${options.map(opt => {
                    const isSelected = (opt === userSelection);
                    return `<p style="${isSelected ? 'font-weight: bold; color: green;' : 'color: gray;'}">
                            ${escapeHTML(opt)} ${isSelected ? '✔' : ''}
                        </p>`;
                }).join("")}
            </div>
            <div style="margin-top: 10px;">
                ${myId === creatorId ? `
                    <button class="passive buttontext" onclick="open_poll_closer('${pollId}',\`${escapeBackticks(pollText)}\`)"
                        style="margin-right: 10px; background-image: url('img/result.svg'); background-position: center; background-repeat: no-repeat; background-size: 85%; width: 40px; height: 40px;"></button>
                ` : ''}
                <button class="passive buttontext" onclick="closeOverlay()"
                    style="background-image: url('img/decline.svg'); background-position: center; background-size: 90%; background-repeat: no-repeat; width: 40px; height: 40px;"></button>
            </div>
        </div>
    `;

    overlay.innerHTML = html;
    overlay.style.display = 'block';
    requestAnimationFrame(() => overlay.classList.add('show'));
    overlayBg.style.display = 'initial';
    overlayBg.onclick = () => closeOverlay();
    overlayIsActive = true;

    backend(`poll:tally ${pollId} ${optionsInCurrentPoll.length}`);
}

function open_poll_closer(pollId, pollText) {
    closeOverlay();
    const overlay = document.getElementById('poll-end-menu');
    const overlayBg = document.getElementById("overlay-bg");
    if (!overlay || !overlayBg) return;

    currentPollId = pollId;
    const { question, options } = parse_poll_text(pollText);

    let html = `
        <div style="text-align:center; display: inline-block;">
            <h3>${question}</h3>
            <div id="poll-closer-stats" style="background:white; text-align: left; display: inline-block;">
                <p style="color: gray;">Please wait while votes are being counted...</p>
            </div>
            <div id="poll-result-message" style="text-align: left; display: inline-block;">
                <p style="color: gray; font-size: 85%;">Are you sure you want to close the poll?</p>
            </div>
            <div style="margin-top: 10px;">
                <button class="passive buttontext" onclick="request_vote_tallying();"
                    style="background-image: url('img/update.svg'); background-position: center; background-repeat: no-repeat; background-size: 90%; width: 40px; height: 40px;"></button>
                <button class="passive buttontext" onclick="submit_poll_closer()"
                    style="margin-left: 10px; background-image: url('img/accept.svg'); background-position: center; background-repeat: no-repeat; background-size: 90%; width: 40px; height: 40px;"></button>
                <button class="passive buttontext" onclick="closeOverlay()"
                    style="margin-left: 10px; background-image: url('img/decline.svg'); background-position: center; background-repeat: no-repeat; background-size: 90%; width: 40px; height: 40px;"></button>
            </div>
        </div>
    `;

    overlay.innerHTML = html;
    overlay.style.display = 'block';
    requestAnimationFrame(() => overlay.classList.add('show'));
    overlayBg.style.display = 'initial';
    overlayBg.onclick = () => closeOverlay();
    overlayIsActive = true;

    backend(`poll:tally ${pollId} ${options.length}`);
}

function submit_poll_closer() {
    if (!currentPollId) {
        launch_snackbar("Invalid poll context");
        return;
    }

    const sentResults = JSON.parse(localStorage.getItem("sentResults") || "{}");
    if (sentResults[currentPollId]) {
        launch_snackbar("Poll already closed.");
        return;
    }

    if (!currentResultMessage) {
        launch_snackbar("Nothing to send");
        return;
    }

    const finalMessage = `[poll_closed:${currentPollId}]\n` + currentResultMessage;
    const encodedText = btoa(finalMessage);

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

    sentResults[currentPollId] = true;
    localStorage.setItem("sentResults", JSON.stringify(sentResults));

    updatePollSubtitle(currentPollId);

    backend(cmd);
    closeOverlay();
    overlayIsActive = false;
}

function open_poll_result(pollId, pollText) {
    closeOverlay();
    const overlay = document.getElementById('poll-result-menu');
    const overlayBg = document.getElementById("overlay-bg");
    if (!overlay || !overlayBg) return;

    currentPollId = pollId;
    const { question, options } = parse_poll_text(pollText);
    optionsInCurrentPoll = options;
    currentQuestion = question;

    if (!pollText) {
        launch_snackbar("Poll metadata missing");
        return;
    }

    let html = `
        <div id="poll-result-menu" style="text-align:center">
            <h3>${escapeHTML(question)}</h3>
            <div id="poll-result-stats" style="background:white; text-align: left; display: inline-block;">
                <p style="color: gray;">Please wait while votes are being counted...</p>
            </div>
            <div style="margin-top: 10px;">
                <button class="passive buttontext" onclick="closeOverlay()"
                    style="background-image: url('img/decline.svg'); background-size: 90%; background-position: center; background-repeat: no-repeat; background-size: 60%; width: 40px; height: 40px;"></button>
            </div>
        </div>
    `;

    overlay.innerHTML = html;
    overlay.style.display = 'block';
    requestAnimationFrame(() => overlay.classList.add('show'));
    overlayBg.style.display = 'initial';
    overlayBg.onclick = () => closeOverlay();
    overlayIsActive = true;

    backend(`poll:tally ${currentPollId} ${optionsInCurrentPoll.length}`);
}

/**
*   Send a tally request to the backend.
*/
function request_vote_tallying() {
    const sentResults = JSON.parse(localStorage.getItem("sentResults") || "{}");
    if (sentResults[currentPollId]) {
        launch_snackbar("This poll is closed. You cannot update the results.");
        return;
    }
    backend(`poll:tally ${currentPollId} ${optionsInCurrentPoll.length}`);
}

/**
 * Called from the backend to update the poll results
 */
function b2f_showPollTally(pollId, countsArray) {
    console.log("Received poll results for", pollId, countsArray);
    if (!Array.isArray(countsArray) || countsArray.length !== optionsInCurrentPoll.length) {
        launch_snackbar("Mismatch in poll results");
        return;
    }

    // Determine winner(s)
    const maxVotes = Math.max(...countsArray);
    const winners = countsArray.map((v, i) => v === maxVotes && v > 0);

    // Format each option with vote count and highlight winner
    const resultsHtml = optionsInCurrentPoll.map((option, index) => {
        const votes = countsArray[index] || 0;
        const style = winners[index] ? "font-weight: bold; color: green;" : "";
        return `<p style="${style}">${option} — ${votes} vote${votes !== 1 ? 's' : ''}</p>`;
    }).join("");

    // Compute total votes and expected voters
    let totalVotes = countsArray.reduce((a, b) => a + b, 0);
    let expectedVoters = 0;

    const ch = tremola.chats[curr_chat];
    if (curr_chat === "ALL") {
        expectedVoters = "ALL";
    } else if (ch && ch.members && Array.isArray(ch.members)) {
        expectedVoters = ch.members.length;
    }

    const votedSummary = (expectedVoters === "ALL")
        ? `${totalVotes} of ALL voted`
        : `${totalVotes} of ${expectedVoters} voted`;

    currentResultMessage = `Results for: ${currentQuestion}\n` +
        optionsInCurrentPoll.map((opt, idx) => `${opt}: ${countsArray[idx]} vote${countsArray[idx] !== 1 ? 's' : ''}`).join("\n");

    const resultsHtmlWithSummary = resultsHtml +
        `<hr><p style="color: gray; font-size: small;">${votedSummary}</p>`;

    const resultTitleEl = document.querySelector("#poll-result-menu h3");
    const resultStatsEl = document.getElementById("poll-result-stats");

    const closerTitleEl = document.querySelector("#poll-closer-menu h3");
    const closerStatsEl = document.getElementById("poll-closer-stats");

    if (resultTitleEl) resultTitleEl.innerText = currentQuestion;
    if (resultStatsEl) resultStatsEl.innerHTML = resultsHtmlWithSummary;

    if (closerTitleEl) closerTitleEl.innerText = currentQuestion;
    if (closerStatsEl) closerStatsEl.innerHTML = resultsHtmlWithSummary;
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
 * Collects and returns all non-empty poll option values from the DOM.
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
 * is_poll_uniquely_filled(question, options)
 *
 * Validates that the poll question is non-empty, all options are filled and unique and that no
 * option is only whitespace. Options are normalized in lowercase without whitespaces.
 *
 * @param {string} question - The poll question to validate.
 * @param {string[]} options - The list of poll options to validate gathered from the DOM.
 * @returns {boolean} - True if the question and all options are properly filled, false otherwise.
 */
function is_poll_uniquely_filled(question, options) {
    if (typeof question !== 'string' || question.trim().length === 0) return false;
    if (!Array.isArray(options)) return false;

    const cleanedOptions = options
        .map(opt => (typeof opt === 'string' ? opt.trim() : ''))
        .filter(opt => opt.length > 0);

    if (cleanedOptions.length < 2) return false;

    const normalizedOptions = cleanedOptions.map(opt => opt.toLowerCase());
    const uniqueOptions = new Set(normalizedOptions);

    return uniqueOptions.size === cleanedOptions.length;
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
        var plusCode = Android.getCurrentLocationAsPlusCode();
        if (plusCode != null && plusCode.length > 0) {
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

/**
 * build_vote_command(encodedPayload)
 *
 * Constructs the appropriate backend command for sending a vote.
 *
 * @param {string} encodedPayload - The base64-encoded vote data.
 * @returns {string} - The backend command string to send the vote.
 */
function build_vote_command(encodedPayload) {
    const ch = tremola.chats[curr_chat];
    if (!(ch.timeline instanceof Timeline)) {
        ch.timeline = Timeline.fromJSON(ch.timeline);
    }
    const tips = JSON.stringify(ch.timeline.get_tips());

    return `poll:vote ${tips} ${encodedPayload} null ${currentPollCreator}`;
}

/**
 * parse_poll_text(text)
 *
 * Extracts the poll question and option strings from formatted poll message text.
 *
 * @param {string} text - The full poll text (HTML line-separated with <br>).
 * @returns {{ question: string, options: string[] }} Parsed question and options.
 */
function parse_poll_text(text) {
    const lines = text.split("<br>\n");
    const question = lines[0].replace("📊 Poll: ", "").trim();
    const options = lines
        .slice(1)
        .map(line => line.replace("[ ]", "").trim())
        .filter(opt => opt.length > 0);
    return { question, options };
}