require('dotenv').config(); // sets up your dotenv environment
const express           = require('express');
const cors              = require('cors');
const mysql             = require('mysql2/promise');
const dbObject = {host:'localhost', user: 'root', password: 'password', database: 'dev_mystats'};

const dayArr = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
// const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthNames = ["Jan", "Feb", "March", "April", "May", "June", "July", "Aug", "Sep", "Oct", "Nov", "Dec"];

const app = express();
app.listen(4000, () => { console.log('listening on port ', 4000) })


// Config of Middlewares
app.use(cors({origin: '*'}))
app.use(express.static('/public'));
app.use(express.urlencoded({extended: false}));
app.use(express.json());

//--start--- some small helper functions
const calculate_the_stats_for_this_date = async (obj) => {
    const dbCon = await mysql.createConnection(dbObject);
    const {date_fmt, goals} = obj;
    const subs = {}

    // seperates each of the goals in the object called subs
    goals.forEach(ech => { subs[ech.id] = ech; })

    // total time in work (time work ended - time work started)
    let total_work_hours = subs['15'].typ_hours - subs['14'].typ_hours

    // worked more than 15hours, calculates the total work time for the day (time ended work - time started - break_time - distraction_time)
    let total_time_on_sit = subs['15'].typ_hours - subs['14'].typ_hours - subs['16'].typ_hours - subs['17'].typ_hours
    if (total_time_on_sit < 15) {
        subs['2'].typ_val = 'failed'
        dbCon.execute(`UPDATE goals_stat SET typ_val = 'failed',  where typ_id = 2 limit 1`);
    }

    // difference btw wake time and start time (i.e time lost before worked kicked off)
    let time_lost_b4_start_work = subs['14'].typ_hours - subs['13'].typ_hours

    let time_lost_to_breaks = subs['16'].typ_hours
    let time_lost_to_distraction = subs['17'].typ_hours
    let overall_lost_hours = time_lost_b4_start_work + time_lost_to_breaks + time_lost_to_distraction

    let [rows] = await dbCon.execute(`SELECT id from goals_stat where date_w = '${date_fmt}' limit 1`);
    if (rows[0]) {
        table_id = rows[0].id;
        let [result] = await dbCon.execute(`UPDATE goals_stat SET t1='${total_work_hours}', t2='${total_time_on_sit}', t3=${time_lost_b4_start_work},
            t4='${time_lost_to_breaks}', t5='${time_lost_to_distraction}', t6=${overall_lost_hours}
            where id = ${table_id} limit 1`);
    } else {
        let [result] = await dbCon.execute(`INSERT INTO goals_stat (date_w, t1, t2, t3, t4, t5, t6) values
            ('${date_fmt}', ${total_work_hours}, ${total_time_on_sit}, ${time_lost_b4_start_work},
            ${time_lost_to_breaks}, ${time_lost_to_distraction}, ${overall_lost_hours})`);
    }

    return {'msg':'okay'}
}

const get_overall_stats_for_this_month = async (obj) => {
    const dbCon = await mysql.createConnection(dbObject);
    const {year, month} = obj;
    const date_start = `${year}-${month}-01`
    const date_end = `${year}-${month}-31`
    const ret = {'a':[]}

    const [rows] = await dbCon.execute(`SELECT * FROM tracks_list ORDER BY id asc`);
    const sumUp = rows.map(async (row) => {
        if (row.typ == 'select_yes') {
            // get the total for that month, get the total passed, get the total failed, calcultate the scores
            let [q1] = await dbCon.execute(`SELECT count(*) as total from goals_completed where date_w >= '${date_start}' and date_w <= '${date_end}' and typ_id = ${row.id}`);
            let [q2] = await dbCon.execute(`SELECT count(*) as passed from goals_completed where date_w >= '${date_start}' and date_w <= '${date_end}' and typ_id = ${row.id} and typ_val = 'passed'`);
            let [q3] = await dbCon.execute(`SELECT count(*) as failed from goals_completed where date_w >= '${date_start}' and date_w <= '${date_end}' and typ_id = ${row.id} and typ_val = 'failed'`);

            // calculate the scores - get the percentage scores
            const scores = ((q2[0].passed/q1[0].total) * 100).toFixed(0)

            const james = {'title':row.title, 'total':q1[0].total, 'passed':q2[0].passed, 'failed':q3[0].failed, scores};
            ret.a.push(james)
            return james
        } else if (row.typ == 'select_time') {
            let [q1] = await dbCon.execute(`SELECT SUM(typ_hours) as total from goals_completed where date_w >= '${date_start}' and date_w <= '${date_end}' and typ_id = ${row.id}`);
            console.log('sume of', q1)
            const james = {'title':`Sum of ${row.title}`, 'total':q1[0].total};
            return [];
        } else if (row.typ == 'input_hours') {
            let [q1] = await dbCon.execute(`SELECT count(*) as total from goals_completed where date_w >= '${date_start}' and date_w <= '${date_end}' and typ_id = ${row.id}`);
            return [];
        }
    })

    return Promise.all(sumUp).then(re => { return ret })
}
//--end--


app.get('/', (req, res) => { console.log('first request to the home page'); res.json({'msg':'we good'}) })

// fetches all the list of goals to complete for today
app.get('/get-the-goals/', async (req, res) => {
    const dbCon = await mysql.createConnection(dbObject);
    const [rows, fields] = await dbCon.execute(`SELECT * FROM tracks_list ORDER BY id asc`);
    res.json({'msg':'okay', rows})
})

// fetches the archived goals and the stats for each of those goals
app.get('/get-archieved-goals/', async (req, res) => {
    const dbCon = await mysql.createConnection(dbObject);
    let {m:month, y:year} = req.query; month = Number(month);
    const date_arr = []
    let theDay, day;
    const ret = {'msg':'okay', 'every_day':[]}

    for (let i = 31; i >= 1; i--) { date_arr.push({'dfmt':`${year}-${month}-${i}`, 'day':i}) }

    // get the result for every day of the the
    const promises = date_arr.map( async ({dfmt, day}) => {
        // get the goals completed
        let [q1] = await dbCon.execute(`SELECT typ_id, typ, typ_val, typ_hours, (SELECT title from tracks_list where tracks_list.id = goals_completed.typ_id limit 1) as title
            from goals_completed where date_w = '${dfmt}'`);

        // get the stats
        let [q2] = await dbCon.execute(`SELECT t1, t2, t3, t4, t5, t6 FROM goals_stat where date_w = '${dfmt}'`);

        ret.every_day.push({
            'date':dfmt,
            'day':dayArr[(new Date(year, month - 1, day)).getDay()],
            'd_shw':`${monthNames[(new Date(year, month - 1, day)).getMonth()]} ${day}, ${(new Date(year, month-1)).getFullYear()}`,
            'goals':q1, 'stats':q2[0]
        })
        return [q1, q2];
    })

    const mth = await get_overall_stats_for_this_month({month, year})

    // fetching has been completed
    Promise.all([promises, mth]).then(re => {
        res.json({...ret, mth})
    })
})

// saves the goals archived for a particular day
app.post('/save-this-archive/', async (req, res) => {
    const dbCon = await mysql.createConnection(dbObject);
    const {theDay, theMonth, theYear, goals} = req.body;
    if (theDay < 10) { theDay = `0${theDay}`; }
    if (theMonth < 10) { theMonth = `0${theMonth}`; }

    var typ_val = '', typ_hours = 0, hour_val, mins_val, table_id;

    // format the date and get it ready for our mysql database
    const date_fmt = `${theYear}-${theMonth}-${theDay}`

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
    
        let [rows] = await dbCon.execute(`SELECT id from goals_completed where date_w = '${date_fmt}' and typ_id = ${ech.id} limit 1`);
        if (rows[0]) {
            table_id = rows[0].id;
            let [result] = await dbCon.execute(`UPDATE goals_completed SET typ='${ech.typ}', typ_val='${ech.typ_val}', typ_hours=${ech.typ_hours} where id = ${table_id} limit 1`);
        } else {
            let [result] = await dbCon.execute(`INSERT INTO goals_completed (date_w, typ_id, typ, typ_val, typ_hours) values ('${date_fmt}', ${ech.id}, '${ech.typ}', '${ech.typ_val}', ${ech.typ_hours})`);
            // let {insertId} = result; or let insertId = result.insertId
            // console.log(`INSERT INTO goals_completed (date_w, typ_id, typ, typ_val, typ_hours) values ('${date_fmt}', ${ech.id}, '${ech.typ}', '${ech.typ_val}', ${ech.typ_hours})`)
        }
    })

    calculate_the_stats_for_this_date({date_fmt, goals})
    res.json({'msg':'okay', 'cause':'Moving higher!'})
})