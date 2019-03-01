function console_red(...items) {
    var title = items.shift()

    var my_items = items.map(item => JSON.parse(JSON.stringify(item)))

    console.log(`%c=== ${title} ===`, 'font-weight: bold; color: red; text-transform: uppercase', ...my_items);
}

module.exports = {
    console_red
}