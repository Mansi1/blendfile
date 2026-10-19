// VERIFIED: defuss dispatches JSX event handlers from a listener on the document. Inside a shadow root (the website's
// inspector) the browser retargets event.target to the shadow host there, so handlers read the element that fired
// from the event's composed path instead.
export const eventElement = <T extends Element>(event: Event) => event.composedPath()[0] as T;
