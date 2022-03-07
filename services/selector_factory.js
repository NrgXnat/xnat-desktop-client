// TODO: import improvements from MSBASE 
module.exports = (dom_context) => {
    return {
        $on(event, selector, handler) {
            const _selector = context_selector(selector, dom_context)

            $(document).on(event, _selector, handler)
        },

        $$(selector) {
            const _selector = context_selector(selector, dom_context)
            return $(_selector)

            //========= ALT
            // return $(selector, dom_context)
        }
    }
}

function context_selector(selector, dom_context) {
    return selector
        .split(',')
        .map(sel => sel.trim())
        .map(sel => sel.startsWith(dom_context) ? sel : `${dom_context} ${sel}`)
        .join(', ')
}