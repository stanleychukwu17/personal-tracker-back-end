require('dotenv').config(); // sets up your dotenv environment
const express           = require('express');
const cors              = require('cors');
const mysql             = require('mysql2/promise');
const dbObject = {host:'localhost', user: 'root', password: 'password', database: 'dev_mystats'};

const dayArr = [
    'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
]
const fullMonthNames = [
    "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"
];
const monthNames = [
    "Jan", "Feb", "March", "April", "May", "June", "July", "Aug", "Sep", "Oct", "Nov", "Dec"
];

// creates the node-express app
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
    const {date_fmt, goals, subs} = obj;

    // total time in work (time work ended - time work started)
    let total_work_hours = subs['15'].typ_hours - subs['14'].typ_hours

    // worked more than 15hours, calculates the total work time for the day (time_ended_work - time_started - break_time - distraction_time)
    let total_time_on_sit = subs['15'].typ_hours - subs['14'].typ_hours - subs['16'].typ_hours - subs['17'].typ_hours

    // difference btw wake time and start time (i.e time lost before worked kicked off), and then calculate overall lost hours
    let time_lost_b4_start_work = subs['14'].typ_hours - subs['13'].typ_hours
    let time_lost_to_breaks = subs['16'].typ_hours
    let time_lost_to_distraction = subs['17'].typ_hours
    let overall_lost_hours = time_lost_b4_start_work + time_lost_to_breaks + time_lost_to_distraction

    // updates the stats calculated if it already exists in our database or inserts the data into the database
    let [rows] = await dbCon.execute(`SELECT id from goals_stat where date_w = '${date_fmt}' limit 1`);
    if (rows[0]) {
        table_id = rows[0].id;
        let [result] = await dbCon.execute(`UPDATE goals_stat SET t1='${total_work_hours}', t2='${total_time_on_sit}', t3=${time_lost_b4_start_work}, t4='${time_lost_to_breaks}', t5='${time_lost_to_distraction}', t6=${overall_lost_hours}
            where id = ${table_id} limit 1`);
    } else {
        let [result] = await dbCon.execute(`INSERT INTO goals_stat (date_w, t1, t2, t3, t4, t5, t6) values ('${date_fmt}', ${total_work_hours}, ${total_time_on_sit}, ${time_lost_b4_start_work}, ${time_lost_to_breaks}, ${time_lost_to_distraction}, ${overall_lost_hours})`);
    }

    return subs
}

const get_overall_stats_for_this_month = async (obj) => {
    const dbCon = await mysql.createConnection(dbObject);
    const {year, month} = obj;
    const date_start = `${year}-${month}-01`
    const date_end = `${year}-${month}-31`
    const ret = {'month_name':`${monthNames[month - 1]}, ${year}`, 'num_return':0, 'a':[], 'b':[], 'c':[], 'scores_arr':[]}

    const [rows] = await dbCon.execute(`SELECT * FROM tracks_list ORDER BY id asc`);
    const sumUp = rows.map(async (row) => {
        if (row.typ == 'select_yes') {
            // get the total for that month, get the total passed, get the total failed, calcultate the scores
            let [q1] = await dbCon.execute(`SELECT count(*) as total from goals_completed where date_w >= '${date_start}' and date_w <= '${date_end}' and typ_id = ${row.id}`);
            let [q2] = await dbCon.execute(`SELECT count(*) as passed from goals_completed where date_w >= '${date_start}' and date_w <= '${date_end}' and typ_id = ${row.id} and typ_val = 'passed'`);
            let [q3] = await dbCon.execute(`SELECT count(*) as failed from goals_completed where date_w >= '${date_start}' and date_w <= '${date_end}' and typ_id = ${row.id} and typ_val = 'failed'`);

            // calculate the scores - get the percentage scores
            const scores = ((q2[0].passed/q1[0].total) * 100).toFixed(0)
            ret.num_return = q1[0].total;

            const james = {'title':row.title, 'total':q1[0].total, 'passed':q2[0].passed, 'failed':q3[0].failed, scores};
            ret.a.push(james)
            ret.scores_arr.push(scores)
            return james
        } else if (row.typ == 'select_time' || row.typ == 'input_hours') {
            // gets the average time for each of the goals in this category
            let [q1] = await dbCon.execute(`SELECT ROUND(AVG(typ_hours), 2) as ag from goals_completed where date_w >= '${date_start}' and date_w <= '${date_end}' and typ_id = ${row.id}`);
            const james = {'title':`Average ${row.title}`, 'typ':row.typ, 'avg':q1[0].ag}
            ret.b.push(james)
            return james
        }
    })

    // get the average for more stats from the 'goals_stat' table
    let [jz] = await dbCon.execute(`SELECT ROUND(AVG(t1), 2) as t1, ROUND(AVG(t2), 2) as t2, ROUND(AVG(t3), 2) as t3, ROUND(AVG(t4), 2) as t4, ROUND(AVG(t5), 2) as t5, ROUND(AVG(t6), 2) as t6
        from goals_stat where date_w >= '${date_start}' and date_w <= '${date_end}'`);
    ret.b.push({'title':`Avg work hours`, 'avg':jz[0].t1});                ret.b.push({'title':`Avg time on sit`, 'avg':jz[0].t2});                    ret.b.push({'title':`Avg time lost b4 start work`, 'avg':jz[0].t3})
    ret.b.push({'title':`Avg time lost to breaks`, 'avg':jz[0].t4});       ret.b.push({'title':`Avg time lost to distraction`, 'avg':jz[0].t5});       ret.b.push({'title':`Avg overall lost hours`, 'avg':jz[0].t6})

    // second, we select the sum of the hours (i.e total hours done for each of the stats)
    let [pa] = await dbCon.execute(`SELECT SUM(t1) as t1, SUM(t2) as t2, SUM(t3) as t3, SUM(t4) as t4, SUM(t5) as t5, SUM(t6) as t6 from goals_stat where date_w >= '${date_start}' and date_w <= '${date_end}'`);
    ret.c.push({'title':`Total worked hours`, 'tot':pa[0].t1});              ret.c.push({'title':`Total time on sit`, 'tot':pa[0].t2});                    ret.c.push({'title':`Total time lost b4 start work`, 'tot':pa[0].t3})
    ret.c.push({'title':`Total time lost to breaks`, 'tot':pa[0].t4});       ret.c.push({'title':`Total time lost to distraction`, 'tot':pa[0].t5});       ret.c.push({'title':`Total overall lost hours`, 'tot':pa[0].t6})

    // returns the final result wrapped in a promise
    return Promise.all(sumUp, jz, pa).then(re => { return ret })
}
//--end--


// request to the home page
app.get('/', (req, res) => { res.json({'msg':'we good'}) })

// fetches all the list goals available to the user for completion
app.get('/get-the-goals/', async (req, res) => {
    const dbCon = await mysql.createConnection(dbObject);
    const [rows, fields] = await dbCon.execute(`SELECT * FROM tracks_list ORDER BY id asc`);
    res.json({'msg':'okay', rows})
})

// fetches the archived goals and the stats for each of those goals
app.get('/get-archieved-goals/', async (req, res) => {
    const dbCon = await mysql.createConnection(dbObject);
    let {m:month, y:year} = req.query; month = Number(month);
    let date_arr = [], prom2 = [], diff_month_stats = [], mkay = {};
    const ret = {'msg':'okay', 'every_day':[]}

    // formats the whole dates for the month received 2022-01-1, 2022-01-2, 2022-01-3 e.t.c
    for (let i = 31; i >= 1; i--) { date_arr.push({'dfmt':`${year}-${month}-${i}`, 'day':i}) }

    // get the result for every day of the dates
    const promises = date_arr.map( async ({dfmt, day}) => {
        // get the goals completed
        let [q1] = await dbCon.execute(`SELECT typ_id, typ, typ_val, typ_hours, (SELECT title from tracks_list where tracks_list.id = goals_completed.typ_id limit 1) as title from goals_completed where date_w = '${dfmt}'`);

        // get the stats
        let [q2] = await dbCon.execute(`SELECT t1, t2, t3, t4, t5, t6 FROM goals_stat where date_w = '${dfmt}'`);

        ret.every_day.push({
            'date':dfmt,
            'day':dayArr[(new Date(year, month - 1, day)).getDay()], // the day to show, e.g mon or tur
            'd_shw':`${monthNames[(new Date(year, month - 1, day)).getMonth()]} ${day}, ${(new Date(year, month-1)).getFullYear()}`, // the month and year
            'goals':q1, 'stats':q2[0]
        })
        return [q1, q2];
    })

    // get the last 6 months and then get their stats
    let getMonths = [], totMonths = 6, tempMonth = Number(month), tempYear = Number(year)
    for (var i = totMonths; i > 0; i--) {
        getMonths.push({'month':tempMonth, 'year':tempYear})
        tempMonth-- // reduces the tempMonth as we loop through the total months we want to fetch
        if (tempMonth <= 0) { tempYear--; tempMonth = 12; }
    }
    // fetches each of the last 6 months
    prom2 = getMonths.map(async (h) => {
        const sabiBoy = await get_overall_stats_for_this_month({'month':h.month, 'year':h.year})
        if (sabiBoy.num_return > 0) {
            mkay[h.year+''+h.month] = sabiBoy;
        }
        return sabiBoy
    })

    // fetching has been completed, destructure all of the promises since the promises are wrapped in arrays inside an array i.e [ [promise promise, promise] ]
    Promise.all([...promises, ...prom2]).then(re => {
        // i wanted the last 6 months to show from the most recent month, so i had to sort like below
        Object.keys(mkay).sort().reverse().map(each_key => {diff_month_stats.push(mkay[each_key]) })
        res.json({...ret, diff_month_stats})
    })
})

// saves the goals archived for a particular day
app.post('/save-this-archive/', async (req, res) => {
    const dbCon = await mysql.createConnection(dbObject), subs = {};
    const {theDay, theMonth, theYear, goals} = req.body;
    var typ_val = '', hour_val, mins_val, table_id;

    // calculates the proper hours to store in the database for all the time values
    goals.map(ech => {
        if (ech.typ == 'select_time' || ech.typ == 'input_hours') {
            hour_val = (ech.hour_val && Number(ech.hour_val)) || 0
            mins_val = (ech.mins_val && Number(ech.mins_val)) || 0
            if (mins_val > 0) {
                mins_val = mins_val/60
                hour_val = hour_val + mins_val;
            }

            ech.typ_hours = hour_val
        }

        subs[ech.id] = ech; // seperates each of the goals
    })

    // format the date and get it ready for our mysql database
    const date_fmt = `${theYear}-${theMonth}-${theDay}`

    const prom2 = goals.map( async (ech) => {
        ech.typ_val = '';

        if (ech.typ == 'select_yes' && ech.val && ech.val.length > 0) { ech.typ_val = ech.val; ech.typ_hours = 0; }
        else if (ech.typ == 'select_yes' && !ech.val) { ech.typ_val = ech.def; ech.typ_hours = 0; }

        // worked more than 15hours or not
        if (ech.id == 2) {
            let total_time_on_sit = Number(subs['15'].typ_hours) - Number(subs['14'].typ_hours) - Number(subs['16'].typ_hours) - Number(subs['17'].typ_hours)
            if (total_time_on_sit < 15) { ech.typ_val = 'failed' }
        }

        let [rows] = await dbCon.execute(`SELECT id from goals_completed where date_w = '${date_fmt}' and typ_id = ${ech.id} limit 1`);
        if (rows[0]) {
            table_id = rows[0].id;
            let [result] = await dbCon.execute(`UPDATE goals_completed SET typ='${ech.typ}', typ_val='${ech.typ_val}', typ_hours=${ech.typ_hours} where id = ${table_id} limit 1`);
            return result
        } else {
            let [result] = await dbCon.execute(`INSERT INTO goals_completed (date_w, typ_id, typ, typ_val, typ_hours) values ('${date_fmt}', ${ech.id}, '${ech.typ}', '${ech.typ_val}', ${ech.typ_hours})`);
            return result
            // let {insertId} = result; or let insertId = result.insertId
            // console.log(`INSERT INTO goals_completed (date_w, typ_id, typ, typ_val, typ_hours) values ('${date_fmt}', ${ech.id}, '${ech.typ}', '${ech.typ_val}', ${ech.typ_hours})`)
        }
    })

    calculate_the_stats_for_this_date({date_fmt, goals, subs}) // calculate the stats the info we just saved
    Promise.all([prom2]).then(re => {res.json({'msg':'okay', 'cause':'Moving higher!'}) })
})