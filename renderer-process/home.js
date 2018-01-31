const axios = require('axios');

const login_btn = document.getElementById('login_button');

const user_auth = {
    username: 'darko',
    password: 'simonovic'
}


document.addEventListener('click', function(e){
    console.log(e.target.id);
    if (e.target.id == 'login_button') {
        axios.get('https://xw2017-01.xnat.org/data/auth', {
            auth: user_auth
        })
        .then(res => {
            console.log(res);
        })
        .catch(err => {
            console.log(err)
        });
    }
});


document.getElementById('get_projects').addEventListener('click', function(e){
    axios.get('https://xw2017-01.xnat.org/data/projects', {
        auth: user_auth
    })
    .then(res => {
        console.log('Projects', res.data.ResultSet.Result);
        axios.get('https://xw2017-01.xnat.org/data/projects/'+res.data.ResultSet.Result[0].ID+'/subjects', {
            auth: user_auth
        })
        .then(res => {
            console.log('First Subject', res.data.ResultSet.Result[0]);
        })
        .catch(err => {
            console.log(err)
        });
    })
    .catch(err => {
        console.log(err)
    });
});

function b64EncodeUnicode(str) {
    // first we use encodeURIComponent to get percent-encoded UTF-8,
    // then we convert the percent encodings into raw bytes which
    // can be fed into btoa.
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
        function toSolidBytes(match, p1) {
            return String.fromCharCode('0x' + p1);
    }));
}

function b64DecodeUnicode(str) {
    // Going backwards: from bytestream, to percent-encoding, to original string.
    return decodeURIComponent(atob(str).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
}