export function buildCheckboxOptionId(prefix, value) {
    return `${prefix}${String(value).replace(/[^a-z0-9]+/gi, '')}`;
}

export function renderCheckboxOptions({
    values = [],
    selectedValues = [],
    dataAttribute,
    group,
    idPrefix
} = {}) {
    return values.map((value) => {
        const inputId = buildCheckboxOptionId(idPrefix || group, value);
        const isChecked = selectedValues.includes(value);

        return `
            <label class="form-check form-check-card" for="${inputId}">
                <input
                    id="${inputId}"
                    class="form-checkbox"
                    type="checkbox"
                    ${dataAttribute}="${group}"
                    value="${value}"
                    ${isChecked ? 'checked' : ''}
                >
                <span class="form-check-label">${value}</span>
            </label>
        `;
    }).join('');
}

export function getCheckedValues(root, selector) {
    return Array.from(root?.querySelectorAll?.(`${selector}:checked`) || [])
        .map((checkbox) => checkbox.value);
}
