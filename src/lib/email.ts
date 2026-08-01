// mailto: links depend on the browser/OS having a mail client registered
// as the default handler for that protocol — most users never set this
// up, so clicking one silently opens a blank inbox instead of a prefilled
// draft (the exact bug Cindy hit). Gmail's own compose URL bypasses that
// entirely: it opens Gmail's actual compose window, in-browser, with
// fields genuinely filled in, as long as the user is signed into Gmail.
export function buildGmailComposeLink(params: {
  to?: string;
  bcc?: string;
  subject?: string;
  body?: string;
}): string {
  const query = new URLSearchParams({ view: "cm", fs: "1" });
  if (params.to) query.set("to", params.to);
  if (params.bcc) query.set("bcc", params.bcc);
  if (params.subject) query.set("su", params.subject);
  if (params.body) query.set("body", params.body);
  return `https://mail.google.com/mail/?${query.toString()}`;
}
