require('dotenv').config(); // sets up your dotenv environment
const express           = require('express');
const mysql             = require('mysql2/promise');
const dbObject = {host:'localhost', user: 'root', password: 'password', database: 'dev_mystats'};
const cors              = require('cors');

const app = express();
app.listen(4000, () => { console.log('listening on port ', 4000) })


// Config of Middlewares
app.use(cors({origin: '*'}))
app.use(express.static('/public'));
app.use(express.urlencoded({extended: false}));
app.use(express.json());


app.get('/', (req, res) => { console.log('first request to the home page'); res.json({'msg':'we good'}) })

// fetches all the list of goals for each day
app.get('/get-the-goals/', async (req, res) => {
    const connection = await mysql.createConnection(dbObject);
    const [rows, fields] = await connection.execute(`SELECT * FROM tracks_list ORDER BY id asc`);
    res.json({'msg':'okay', rows})
})

// fetches the archived goals and calculates their stats
app.get('/get-archieved-goals/', async (req, res) => {
    res.json({'msg':'okay', 'cause':'timing!'})
})

// saves the goals archived for a particular day
app.post('/save-this-archive/', async (req, res) => {
    const {theDay, theMonth, theYear, goals} = req.body;
    if (theDay < 10) { theDay = `0${theDay}`; }
    if (theMonth < 10) { theMonth = `0${theMonth}`; }

    var typ_val = '', typ_hours = 0, hour_val, mins_val, table_id;

    // format the date and get it ready for our mysql database
    const date_fmt = `${theYear}-${theMonth}-${theDay}`
    const connection = await mysql.createConnection(dbObject);

    goals.forEach( async (ech) => {
        ech.typ_hours = 0; ech.typ_val = typ_val = '';

        if (ech.typ == 'select_yes' && ech.val && ech.val.length > 0) { ech.typ_val = typ_val = ech.val }
        else if (ech.typ == 'select_yes' && !ech.val) { ech.typ_val = typ_val = ech.def }

        if (ech.typ == 'select_time' || ech.typ == 'input_hours') {
            hour_val = (ech.hour_val && Number(ech.hour_val)) || 0
            mins_val = (ech.mins_val && Number(ech.mins_val)) || 0
            if (mins_val > 0) {
                mins_val = mins_val/60
                hour_val = hour_val + mins_val;
            }

            ech.typ_hours = typ_hours = hour_val
        }
    
        let [rows] = await connection.execute(`SELECT id from goals_completed where date_w = '${date_fmt}' and typ_id = ${ech.id} limit 1`);
        if (rows[0]) {
            table_id = rows[0].id;
            let [result] = await connection.execute(`UPDATE goals_completed SET typ='${ech.typ}', typ_val='${ech.typ_val}', typ_hours=${ech.typ_hours} where id = ${table_id} limit 1`);
        } else {
            let [result] = await connection.execute(`INSERT INTO goals_completed (date_w, typ_id, typ, typ_val, typ_hours) values ('${date_fmt}', ${ech.id}, '${ech.typ}', '${ech.typ_val}', ${ech.typ_hours})`);
            // let {insertId} = result; or let insertId = result.insertId
            // console.log(`INSERT INTO goals_completed (date_w, typ_id, typ, typ_val, typ_hours) values ('${date_fmt}', ${ech.id}, '${ech.typ}', '${ech.typ_val}', ${ech.typ_hours})`)
        }
    })

    res.json({'msg':'okay', 'cause':'Moving higher!'})
})