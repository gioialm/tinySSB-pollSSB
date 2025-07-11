let currentPollId = null;
let selectedOption = null;
let currentPollCreator = null;
let optionsInCurrentPoll = [];

/**
 * chat_open_poll_creator()
 *
 * Opens a poll creation overlay on the screen if not already open. Includes input fields for a
 * poll question and two options, along with submit and cancel buttons.
 * TODO: Allow dynamic building of poll options.
 */
function chat_open_poll_creator() {
    const overlay = document.getElementById('poll-creator-menu');
    if (!overlay) return;

    // Fills content
    overlay.innerHTML = `
    <div style="text-align: center;">
        <h3>Create a New Poll</h3>
        <label>Question:</label><br>
        <input type="text" id="poll-question" style="width: 90%; margin: 10px 0;"><br>

        <label>Option 1:</label><br>
        <input type="text" id="poll-option-1" style="width: 90%; margin: 5px 0;"><br>

        <label>Option 2:</label><br>
        <input type="text" id="poll-option-2" style="width: 90%; margin: 5px 0;"><br>

        <div style="margin-top: 20px;">
            <button class="passive buttontext" onclick="chat_submit_poll_creator()" style="background-image: url('img/checked.svg'); background-repeat: no-repeat; width: 35px; height: 35px;"></button>
            <button class="passive buttontext" onclick="closeOverlay()" style="background-image: url('img/cancel.svg'); background-repeat: no-repeat; width: 35px; height: 35px;"></button>
        </div>
    </div>
    `;

    overlay.style.display = 'block';
    requestAnimationFrame(() => overlay.classList.add('show'));
    overlayIsActive = true;
}

/**
 * chat_submit_poll_creator()
 *
 * Collects poll input values and closes the overlay if all fields are filled. If any field is
 * empty, a snackbar message is shown to the user.
 * Currently allows exactly 2 options
 * TODO: Allow dynamic building of poll options.
 */
function chat_submit_poll_creator() {
    const question = document.getElementById('poll-question')?.value;
    const option1 = document.getElementById('poll-option-1')?.value;
    const option2 = document.getElementById('poll-option-2')?.value;

    // Shows snackbar if any of the fields are empty
    if (!question || !option1 || !option2) {
        launch_snackbar("Please fill in all fields.");
        return;
    }

    // Build JSON payload
    const pollData = {
        type: "poll:create",
        question: question,
        options: [option1, option2] //TODO: more than two options
    };

    var payload = ''
        if (Android.isGeoLocationEnabled() == "true") {
            var plusCode = Android.getCurrentLocationAsPlusCode();
            if (plusCode != null && plusCode.length > 0) //check if we actually received a location
                payload += "pfx:loc/plus," + plusCode + "|";
        }

    payload += JSON.stringify(pollData);
    const encodedPayload = btoa(payload);

    var ch = tremola.chats[curr_chat];
        if (!(ch.timeline instanceof Timeline)) {
            ch.timeline = Timeline.fromJSON(ch.timeline);
        }
    let tips = JSON.stringify(ch.timeline.get_tips());

    let cmd;
    if(curr_chat == "ALL") {
        cmd = `publ:poll ${tips} ${encodedPayload} null`;
    } else {
        let recps = tremola.chats[curr_chat].members.join(' ');
        cmd = `priv:poll ${tips} ${encodedPayload} null ${recps}`;

    }

    backend(cmd);
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
    // TO DO: implement correct logic, currently with dummy data
    console.log("Opening results for poll:", pollId);

    const question = "Do you want to go on holiday?";
    const results = [
        { option: "Yes", votes: 5 },
        { option: "No", votes: 0 }
    ];

    const resultsHtml = results.map(r =>
        `<p>${r.votes > 0 ? '✅' : '❌'} <b>${r.option}</b> — ${r.votes} vote${r.votes !== 1 ? 's' : ''}</p>`
    ).join("");

    document.getElementById("resultsTitle").innerText = question;
    document.getElementById("resultsBody").innerHTML = resultsHtml;

    document.getElementById("resultsModal").style.display = "block";
}


function closeResultsModal() {
    document.getElementById("resultsModal").style.display = "none";
}



