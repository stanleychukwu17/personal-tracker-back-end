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

// saves the goals archived for a particular day
app.post('/save-this-archive/', async (req, res) => {
    // const connection = await mysql.createConnection(dbObject);
    console.log(req.body, 'save it now')
    res.json({'msg':'okay', 'cause':'Moving higher!'})
})