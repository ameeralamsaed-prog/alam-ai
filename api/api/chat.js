// This uses a simple public scaling service so you don't need a backend
const CHANNEL_ID = 'my_awesome_website_chat_123'; // Change this to something unique!
const drone = new Scaledrone('yiS12s9Dw060S9H9'); // Public demo ID

drone.on('open', error => {
  if (error) return console.error(error);
  console.log('Successfully connected to Scaledrone');

  const room = drone.subscribe(CHANNEL_ID);
  room.on('data', (text, member) => {
    const el = document.getElementById('chat-messages');
    const msg = document.createElement('div');
    msg.textContent = text;
    msg.style.padding = '5px';
    msg.style.borderBottom = '1px solid #eee';
    el.appendChild(msg);
  });
});

function sendMessage() {
  const input = document.getElementById('chat-input');
  const value = input.value;
  if (value) {
    drone.publish({
      room: CHANNEL_ID,
      message: value,
    });
    input.value = '';
  }
}
