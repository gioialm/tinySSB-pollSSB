/**
 * openPollCreator()
 *
 * Opens a poll creation overlay on the screen if not already open. Includes input fields for a
 * poll question and two options, along with submit and cancel buttons.
 * TODO: Allow dynamic building of poll options.
 */
function openPollCreator() {
    // Checks if overlay already open
    if (document.getElementById('poll-overlay')) return;

    // Creates overlay element
    const overlay = document.createElement('div');
    overlay.id = 'poll-overlay';
    overlay.className = 'qr-overlay';
    overlay.style.display = 'block';

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
            <button class="passive buttontext" onclick="submitPoll()" style="background-image: url('img/checked.svg'); background-repeat: no-repeat; width: 35px; height: 35px;"></button>
            <button class="passive buttontext" onclick="closeOverlay()" style="background-image: url('img/cancel.svg'); background-repeat: no-repeat; width: 35px; height: 35px;"></button>
        </div>
    </div>
    `;

    // Appends overlay to the document to make it visible
    document.body.appendChild(overlay);
}

/**
 * closeOverlay()
 *
 * Closes the poll overlay if it exists.
 * This function looks for the element "el" with ID 'poll-overlay' and removes it, if found.
 */
function closeOverlay() {
    const el = document.getElementById('poll-overlay');
    if (el) el.remove();
}

/**
 * submitPoll()
 *
 * Collects poll input values and closes the overlay if all fields are filled. If any field is
 * empty, a snackbar message is shown to the user.
 * Currently allows exactly 2 options
 * TODO: Allow dynamic building of poll options.
 */
function submitPoll() {
    const question = document.getElementById('poll-question')?.value;
    const option1 = document.getElementById('poll-option-1')?.value;
    const option2 = document.getElementById('poll-option-2')?.value;

    // Shows snackbar if any of the fields are empty
    if (!question || !option1 || !option2) {
        showSnackbar("Please fill in all fields.");
        return;
    }

    // Build JSON payload
    const pollData = {
        type: "poll:create",
        question: question,
        options: [option1, option2] //TODO: more than two options
    };

    const payload = JSON.stringify(pollData);
    const encodedPayload = btoa(payload);

    let cmd;
    if(curr_chat = "ALL") {
        let tips = JSON.stringify(tremola.chats[curr_chat].timeline.get_tips());
        cmd = `publ:post ${tips} ${encodedPayload} null`;
    } else {
        let recps = tremola.chats[curr_chat].members.join(' ');
        let tips = JSON.stringify(tremola.chats[curr_chat].timeline.get_tips());
        cmd = `priv:post ${tips} ${encodedPayload} null ${recps}`;
    }

    backend(cmd);
    closeOverlay();
    showSnackbar("Poll created successfully");
}

/**
 * showSnackbar(message)
 *
 * Displays a temporary snackbar (unclickable notification) message at the bottom of the screen.
 * Fades out automatically after 3 seconds.
 */
function showSnackbar(message) {
    const snackbar = document.getElementById("snackbar");
    if (!snackbar) return;

    snackbar.innerText = message;
    snackbar.className = "show";

    // Remove after 3 seconds
    setTimeout(() => {
        snackbar.className = snackbar.className.replace("show", "");
    }, 3000);
}
