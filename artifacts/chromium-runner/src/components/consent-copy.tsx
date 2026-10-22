export function ConsentDetails() {
  return (
    <ul className="consent-list">
      <li><strong>Recorded when you accept:</strong> chat text, chat usernames and times, and the origin and path of sites you visit in the remote browser, linked to a random ID for this browser.</li>
      <li><strong>Never recorded:</strong> keystrokes, passwords, IP or MAC addresses, URL query strings or fragments.</li>
      <li><strong>Access condition:</strong> declining or withdrawing acceptance blocks the browser and chat. You can withdraw later in Activity settings, which also ends your remote browser session.</li>
    </ul>
  );
}
