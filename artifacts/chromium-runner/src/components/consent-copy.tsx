export function ConsentDetails() {
  return (
    <ul className="consent-list">
      <li><strong>Recorded when you accept:</strong> chat text, chat usernames and times, and the origin and path of sites you visit in the remote browser, linked to a random ID for this browser.</li>
      <li><strong>Names in visit logs:</strong> choosing a chat name saves it even before you send a message. The owner can see your latest chosen name alongside this browser's recorded visits, including earlier visits. Names are self-chosen, not verified identities.</li>
      <li><strong>Never recorded:</strong> keystrokes, passwords, IP or MAC addresses, URL query strings or fragments.</li>
      <li><strong>Extra details:</strong> This is not a live, embedded view of a webpage. It takes photos of the webpage every 20ms, displaying it on your screen. Therefore, audio will not work and there may be other minor discrepancies.</li>
    </ul>
  );
}
