const express = require("express");
const app = express();
const parseISO = require("date-fns/parseISO");
const http = require("http");
const start = require("date-fns/startOfDay");
const end = require("date-fns/endOfDay");
const { errorHandler } = require("./middleware/errorMiddleware");
const { notFound } = require("./middleware/errorMiddleware");
const server = http.createServer(app);
const { Server } = require("socket.io");
const asyncHandler = require("express-async-handler");
const jwt = require("jsonwebtoken");
const io = new Server(server);
const socketioJwt = require("socketio-jwt");
const connectDB = require("./config/db");
const User = require("./model/user");
const Booking = require("./model/booking");
const Venue = require("./model/venue");
const dotenv = require("dotenv");
const generateToken = require("./utils/generateToken");
app.use(express.json());
dotenv.config();
Date.prototype.yyyymmdd = function () {
  var mm = this.getMonth() + 1; // getMonth() is zero-based
  var dd = this.getDate();

  return [
    this.getFullYear(),
    (mm > 9 ? "" : "0") + mm,
    (dd > 9 ? "" : "0") + dd,
  ].join("");
};

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});
app.post(
  "/register",
  asyncHandler(async (req, res, next) => {
    const { name, email, password, phonenumber, username } = req.body;
    const userExists = await User.findOne({
      $or: [
        { username: username },
        { email: email },
        { phonenumber: phonenumber },
      ],
    });
    if (userExists) {
      res.status(400);
      throw new Error("User already exists");
    }
    const user = await User.create({
      name,
      email,
      password,
      phonenumber,
      username,
    });
    if (user) {
      res.status(201);
      res.json({
        _id: user._id,
        email: user.email,
        isAdmin: user.isAdmin,
        token: generateToken(user._id),
        name: user.name,
        phonenumber: user.phonenumber,
        username: user.username,
      });
    } else {
      res.status(400);
      throw new Error("Invalid user data");
    }
  })
);
app.use(
  "/login",
  asyncHandler(async (req, res, next) => {
    const { username, password } = req.body;
    const user = await User.findOne({
      $or: [
        { username: username },
        { email: username },
        { phonenumber: username },
      ],
    });
    if (user && (await user.matchPassword(password))) {
      res.json({
        _id: user._id,
        email: user.email,
        isAdmin: user.isAdmin,
        token: generateToken(user._id),
        name: user.name,
      });
    } else {
      res.status(401);
      throw new Error("Wrong UserName or Password");
    }
  })
);
io.use(
  socketioJwt.authorize({
    secret: process.env.JWTSECRET,
    handshake: true,
  })
);
io.on("connection", async (socket) => {
  let user = await User.findById(socket.decoded_token.id)
    .select("-password")
    .maxTimeMS(1000000);
  console.log("a user connected " + socket.id + user);
  io.emit("register", user);
  socket.on("addbooking", async (userData) => {
    console.log(userData);

    if (user.isAdmin === "false") {
      console.log("admin");
      //get data save to database
      const { name, telephone, date, venue } = JSON.parse(userData);
      const venueData = await Venue.findById(venue);
      console.log(venueData);
      const booking = await Booking.create({
        name,
        telephone,
        date,
        venue: venueData,
      });

      io.emit("register", booking);
    } else {
      console.log("staff");
      io.emit("register", "Staff Unauthorized");
    }
    //get booking values
    //get venue values from database
    //save booking values + push
  });
  socket.on("editbooking", async (userData) => {
    const { name, telephone, date, venue, _id } = JSON.parse(userData);
    const venueData = await Venue.findById(venue);
    if (user.isAdmin === "true") {
      console.log("admin");
      const booking = await Booking.findById(_id);
      if (booking) {
        booking.name = name;
        booking.telephone = telephone;
        booking.data = date;
        booking.venue = venueData;
      }
      const updatedBooking = await booking.save();
      io.emit("register", updatedBooking);
    } else {
      console.log("staff");
      io.emit("register", "Staff Unauthorized");
    }
  });
  socket.on("cancelbooking", async (userData) => {
    const { _id } = JSON.parse(userData);
    if (user.isAdmin === "true") {
      const booking = await Booking.findById(_id);
      if (booking) {
        booking.cancelled = true;
      }
      const updatedBooking = await booking.save();
      io.emit("register", updatedBooking);
      console.log("admin");
    } else {
      console.log("staff");
      io.emit("register", "Staff Unauthorized");
    }
  });
  socket.on("deletebooking", async (userData) => {
    if (user.isAdmin === "true") {
      console.log("admin");
      const { _id } = JSON.parse(userData);
      const booking = await Booking.findById(_id);
      if (booking) {
        await booking.remove();
        io.emit("register", "Booking deleted");
      } else {
        io.emit("register", "No record found");
      }
    } else {
      console.log("staff");
      io.emit("register", "Staff Unauthorized");
    }
  });
  socket.on("getbookings", async (userData) => {
    if (user.isAdmin === "true") {
      console.log("admin");

      let bookings = await Booking.find().populate("venue");
      if (bookings) {
        io.emit("register", bookings);
      } else {
        io.emit("register", "No Bookings");
      }
    } else {
      console.log("staff");
      let bookings = await Booking.find().populate("venue").select("-paid");
      if (bookings) {
        io.emit("register", bookings);
      } else {
        io.emit("register", "No Bookings");
      }
    }
  });
  socket.on("getbookingbyid", async (userData) => {
    const { _id } = JSON.parse(userData);
    if (user.isAdmin === "true") {
      console.log("admin");

      const booking = await Booking.findById(_id)
        .populate("venue")
        .select("-paid");
      if (booking) {
        io.emit("register", booking);
      } else {
        io.emit("register", "Booking Not Found");
      }
    } else {
      console.log("staff");
      const booking = await Booking.findById(_id)
        .populate("venue")
        .select("-paid");
      if (booking) {
        io.emit("register", booking);
      } else {
        io.emit("register", "Booking Not Found");
      }
    }
  });
  socket.on("getbookingbydate", async (userData) => {
    const { date } = JSON.parse(userData);

    if (user.isAdmin === "true") {
      console.log("admin");
      const bookings = await Booking.find({
        //query today up to tonight
        date: {
          $gte: start(parseISO(date), 1),
          $lt: end(parseISO(date), 1),
        },
      });
      io.emit("register", bookings);
    } else {
      console.log("staff");
      const bookings = await Booking.find({
        //query today up to tonight
        date: {
          $gte: start(parseISO(date), 1),
          $lt: end(parseISO(date), 1),
        },
      });
      io.emit("register", bookings);
    }
  });
  socket.on("getbookingbypaid", async (userData) => {
    const { paid } = JSON.parse(userData);
    if (user.isAdmin === "false") {
      const bookings = await Booking.find({ paid: paid });
      if (bookings) {
        io.emit("register", bookings);
      } else {
        io.emit("register", "Booking Not Found");
      }
    } else {
      console.log("staff");
      io.emit("register", "Staff Unauthorized");
    }
  });
  //   {      "name": "alwimowi",     "telephone": "0111437457",     "date":  "2001-03-02"   ,     "venue":  "6119290f872b903798f3974b"         }
  socket.on("getbookingbycancelled", async (userData) => {
    const { cancelled } = JSON.parse(userData);
    if (user.isAdmin === "true") {
      const bookings = await Booking.find({ cancelled: cancelled }).populate(
        "venue"
      );
      if (bookings) {
        io.emit("register", bookings);
      } else {
        io.emit("register", "Booking Not Found");
      }
    } else {
      console.log("staff");
      const bookings = await Booking.find({ cancelled: cancelled })
        .populate("venue")
        .select("-paid");
      if (bookings) {
        io.emit("register", bookings);
      } else {
        io.emit("register", "Booking Not Found");
      }
    }
  });
  socket.on("addvenue", async (userData) => {
    try {
      if (user.isAdmin === "true") {
        const { name } = JSON.parse(userData);
        const venue = await Venue.create({ name });
        io.emit("register", venue);
      } else {
        io.emit("register", "Staff Unauthorized");
      }
    } catch (error) {
      throw new Error("Staff Unauthorized");
    }
  });
  socket.on("editvenue", async (userData) => {
    try {
      if (user.isAdmin === "true") {
        const { name, _id } = JSON.parse(userData);
        const venue = await Venue.findById(_id);
        if (venue) {
          venue.name = name;
        }
        const updatedVenue = await venue.save();

        io.emit("register", updatedVenue);
        console.log(venue);
      } else {
        io.emit("register", "Staff Unauthorized");
      }
    } catch (error) {
      throw new Error("Staff Unauthorized");
    }
  });
  socket.on("deletevenue", async (userData) => {
    try {
      if (user.isAdmin === "true") {
        const { name, _id } = JSON.parse(userData);
        const venue = await Venue.findById(_id);
        if (venue) {
          await venue.remove();
          io.emit("register", "venue deleted");
        } else {
          io.emit("register", "No record found");
        }
      } else {
        io.emit("register", "Staff Unauthorized");
      }
    } catch (error) {
      throw new Error("Staff Unauthorized");
    }
  });
  socket.on("getvenues", async (userData) => {
    if (user.isAdmin === "true") {
      console.log("admin");
      let venues = await Venue.find();
      io.emit("register", venues);
      //   .select("-password");
    } else {
      let venues = await Venue.find();
      io.emit("register", venues);
      console.log("staff");
    }
  });
});
app.use(notFound);
app.use(errorHandler);
if (connectDB()) {
  server.listen(8080, () => {
    console.log("listening on *:8080");
  });
}
