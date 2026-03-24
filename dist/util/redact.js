export function redactSecrets(input) {
    return input.replace(/(Api-Key|User-Api-Key|Authorization):\s*([^\s]+)/gi, "$1: <redacted>");
}
export function redactObject(obj) {
    const json = JSON.stringify(obj, (key, value) => {
        // Redact sensitive fields
        if (key === 'password' || key === 'api_key' || key === 'user_api_key' || key === 'second_factor_token') {
            return '<redacted>';
        }
        return value;
    });
    const redacted = redactSecrets(json);
    try {
        return JSON.parse(redacted);
    }
    catch {
        return obj;
    }
}
//# sourceMappingURL=redact.js.map