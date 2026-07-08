// singleton.js
const Singleton = (function () {
    let instance;

    function init() {
        // Generate a random number
        const randomNumber = Math.random();

        return {
            getRandomNumber: function () {
                return randomNumber;
            }
        };
    }

    return {
        getInstance: function () {
            if (!instance) {
                instance = init();
            }
            return instance;
        }
    };
})();

module.exports = Singleton;