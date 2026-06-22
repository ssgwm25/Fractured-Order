/**
 * Debounce and Throttle Utilities
 * Rate-limiting functions for the ESG Simulation Platform
 */

/**
 * Debounce a function - delays execution until after delay has passed since last call
 * @param {Function} func - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @param {boolean} immediate - Whether to call immediately on first invocation
 * @returns {Function} Debounced function
 */
export function debounce(func, delay = 300, immediate = false) {
    let timeoutId = null;

    const debounced = function (...args) {
        const context = this;

        const callNow = immediate && !timeoutId;

        clearTimeout(timeoutId);

        timeoutId = setTimeout(() => {
            timeoutId = null;
            if (!immediate) {
                func.apply(context, args);
            }
        }, delay);

        if (callNow) {
            func.apply(context, args);
        }
    };

    /**
     * Cancel any pending debounced call
     */
    debounced.cancel = function () {
        clearTimeout(timeoutId);
        timeoutId = null;
    };

    /**
     * Immediately execute the debounced function
     */
    debounced.flush = function (...args) {
        debounced.cancel();
        func.apply(this, args);
    };

    return debounced;
}

/**
 * Throttle a function - limits execution to at most once per delay period
 * @param {Function} func - Function to throttle
 * @param {number} limit - Minimum time between calls in milliseconds
 * @param {Object} options - Options
 * @param {boolean} options.leading - Execute on leading edge (default: true)
 * @param {boolean} options.trailing - Execute on trailing edge (default: true)
 * @returns {Function} Throttled function
 */
export function throttle(func, limit = 300, { leading = true, trailing = true } = {}) {
    let lastCall = 0;
    let lastArgs = null;
    let lastContext = null;
    let timeoutId = null;

    const invoke = () => {
        if (lastArgs) {
            func.apply(lastContext, lastArgs);
            lastArgs = null;
            lastContext = null;
            lastCall = Date.now();
        }
    };

    const throttled = function (...args) {
        const now = Date.now();
        const remaining = limit - (now - lastCall);

        lastArgs = args;
        lastContext = this;

        if (remaining <= 0 || remaining > limit) {
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }

            if (leading) {
                invoke();
            } else {
                lastCall = now;
            }
        } else if (!timeoutId && trailing) {
            timeoutId = setTimeout(() => {
                timeoutId = null;
                invoke();
            }, remaining);
        }
    };

    /**
     * Cancel any pending throttled call
     */
    throttled.cancel = function () {
        clearTimeout(timeoutId);
        timeoutId = null;
        lastArgs = null;
        lastContext = null;
    };

    return throttled;
}

/**
 * Create a debounced async function that cancels pending calls
 * @param {Function} func - Async function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Debounced async function
 */
export function debounceAsync(func, delay = 300) {
    let timeoutId = null;
    let abortController = null;

    const debounced = async function (...args) {
        // Cancel previous pending call
        if (abortController) {
            abortController.abort();
        }

        clearTimeout(timeoutId);

        return new Promise((resolve, reject) => {
            abortController = new AbortController();
            const signal = abortController.signal;

            timeoutId = setTimeout(async () => {
                try {
                    if (signal.aborted) {
                        return;
                    }
                    const result = await func.apply(this, args);
                    if (!signal.aborted) {
                        resolve(result);
                    }
                } catch (error) {
                    if (!signal.aborted) {
                        reject(error);
                    }
                }
            }, delay);

            // Handle abort
            signal.addEventListener('abort', () => {
                clearTimeout(timeoutId);
                reject(new Error('Debounced call was cancelled'));
            });
        });
    };

    debounced.cancel = function () {
        if (abortController) {
            abortController.abort();
        }
        clearTimeout(timeoutId);
    };

    return debounced;
}

/**
 * Rate limit function calls with a queue
 * @param {Function} func - Function to rate limit
 * @param {number} interval - Minimum interval between calls in milliseconds
 * @returns {Function} Rate-limited function
 */
export function rateLimit(func, interval = 1000) {
    const queue = [];
    let processing = false;

    const processQueue = async () => {
        if (processing || queue.length === 0) return;

        processing = true;

        while (queue.length > 0) {
            const { args, resolve, reject, context } = queue.shift();

            try {
                const result = await func.apply(context, args);
                resolve(result);
            } catch (error) {
                reject(error);
            }

            if (queue.length > 0) {
                await new Promise(r => setTimeout(r, interval));
            }
        }

        processing = false;
    };

    return function (...args) {
        return new Promise((resolve, reject) => {
            queue.push({ args, resolve, reject, context: this });
            processQueue();
        });
    };
}

/**
 * Create a function that can only be called once
 * @param {Function} func - Function to wrap
 * @returns {Function} Function that only executes once
 */
export function once(func) {
    let called = false;
    let result;

    return function (...args) {
        if (!called) {
            called = true;
            result = func.apply(this, args);
        }
        return result;
    };
}

/**
 * Defer execution to next tick
 * @param {Function} func - Function to defer
 * @returns {Promise} Promise that resolves after function executes
 */
export function defer(func) {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve(func());
        }, 0);
    });
}

/**
 * Wait for a specified duration
 * @param {number} ms - Duration in milliseconds
 * @returns {Promise} Promise that resolves after the duration
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 * @param {Function} func - Async function to retry
 * @param {Object} options - Options
 * @param {number} options.maxRetries - Maximum number of retries
 * @param {number} options.baseDelay - Base delay in milliseconds
 * @param {number} options.maxDelay - Maximum delay in milliseconds
 * @param {Function} options.shouldRetry - Function to determine if should retry
 * @returns {Promise} Promise that resolves with the function result
 */
export async function retry(
    func,
    {
        maxRetries = 3,
        baseDelay = 1000,
        maxDelay = 30000,
        shouldRetry = () => true
    } = {}
) {
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await func(attempt);
        } catch (error) {
            lastError = error;

            if (attempt === maxRetries || !shouldRetry(error, attempt)) {
                throw error;
            }

            const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
            await sleep(delay);
        }
    }

    throw lastError;
}

export default {
    debounce,
    throttle,
    debounceAsync,
    rateLimit,
    once,
    defer,
    sleep,
    retry
};
