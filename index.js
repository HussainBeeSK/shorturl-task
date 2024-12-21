const express = require('express');
require('dotenv').config();
const passport = require('passport');
require("./config/passport")  
const session = require('express-session');
const connection = require('./config/database')
const urlRoute = require("./routes/url")
const userRoute = require("./routes/user")
const app = express();
app.use(express.json());

  

app.use(
    session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
    })
);
app.use(passport.initialize());
app.use(passport.session());


app.get('/', (req, res) => {
    res.send('Welcome to the Short URL Service!');
});

// Routes
app.use("/api" ,urlRoute);
app.use('/auth', userRoute);

connection().then(()=>{
    console.log("DataBase connected Successfully");
    app.listen(process.env.PORT,()=>{
        console.log(`Listening to the port ${process.env.PORT} succcessfully`);
    })
}).catch(()=>{
    console.log("There is an issue Establishing Database connection")
})
