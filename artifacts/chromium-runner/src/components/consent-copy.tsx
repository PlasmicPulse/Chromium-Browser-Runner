export function ConsentDetails() {
  return (
    <ul className="consent-list">
      <li><strong>Recorded if you allow:</strong> chat text, chat usernames and times, and the origin and path of sites you visit in the remote browser, linked to a random ID for this browser.</li>
      <li><strong>Never recorded:</strong> keystrokes, passwords, IP or MAC addresses, URL query strings or fragments.</li>
      <li>Only the site owner can see these records. Everything works the same if you decline.</li>
    </ul>
  );
}
