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

    closeOverlay();
}