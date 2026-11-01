export function groupRuns(messages) {
    const same = (a, b) => a && b && a.sender && a.sender === b.sender && a.self === b.self
        && (!a.day || !b.day || a.day === b.day)
        && (!a.time || !b.time || Math.abs(a.time - b.time) <= 300);
    return messages.map((message, index) => {
        const previous = same(messages[index - 1], message), next = same(message, messages[index + 1]);
        return previous ? next ? "mid" : "last" : next ? "first" : "single";
    });
}
