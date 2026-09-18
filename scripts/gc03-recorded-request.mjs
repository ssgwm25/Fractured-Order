// The caller supplies authenticated transport; evidence never includes headers
// or request bodies. Persist intent before dispatch, including aborted requests.
export async function recordedRequest({ requests, save, send, who, path, method }) {
    const record = { who, path, method, startedAt: new Date().toISOString(), completed: false };
    requests.push(record);
    await save();
    try {
        const response = await send();
        record.status = response.status;
        record.requestId = response.headers.get('sb-request-id');
        record.correlationId = response.headers.get('x-gc03-request-id');
        const text = await response.text();
        try { record.data = JSON.parse(text); } catch { record.data = null; }
        record.completed = true;
        return record;
    } catch (error) {
        record.error = { name: error.name, message: error.message };
        throw new Error(`${who} ${method} ${path}: ${error.message}`, { cause: error });
    } finally {
        record.at = new Date().toISOString();
        await save();
    }
}
