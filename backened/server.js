const express = require("express");
const app = express();

const http = require("http");

const { errorHandler } = require("./middleware/errorMiddleware");
const { notFound } = require("./middleware/errorMiddleware");
const server = http.createServer(app);
const { Server } = require("socket.io");
const asyncHandler = require("express-async-handler");

const io = new Server(server);
const socketioJwt = require("socketio-jwt");
const connectDB = require("./config/db");
const User = require("./model/user");
const Booking = require("./model/booking");
const Venue = require("./model/venue");
const dotenv = require("dotenv");
const generateToken = require("./utils/generateToken");
const path = require("path");
const ___dirname = path.resolve();
app.use(express.json());
dotenv.config();

// app.get("/", (req, res) => {
//   res.sendFile(___dirname + "/index.html");
// });

app.post(
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

function getSocketIdHandle(arr) {
  return "";
}
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
  const socketId = socket.id;
  // init socket
  const arr = user.socketId;

  const existSocketIdStr = getSocketIdHandle(arr);
  const newSocketIdStr = existSocketIdStr
    ? `${existSocketIdStr},${socketId}`
    : socketId;
  user.socketId = newSocketIdStr;
  user.save();

  console.log(
    "initSocket user_id=>",
    user,
    "time=>",
    new Date().toLocaleString()
  );

  socket.on("action", async (action) => {
    if (action.type === "server/getbookings") {
      try {
        if (user.isAdmin === true) {
          let bookings = await Booking.find().populate("venue");
          if (bookings) {
            io.to(user.socketId).emit("action", {
              type: "BOOKING_LIST_SUCCESS",
              data: bookings,
            });
            // io.emit("register", bookings);
          } else {
            // io.emit("register", "No Bookings");
            io.to(user.socketId).emit("action", {
              type: "message",
              data: "No data!",
            });
          }
        } else {
          let bookings = await Booking.find().populate("venue").select("-paid");
          if (bookings) {
            io.to(user.socketId).emit("action", {
              type: "BOOKING_LIST_SUCCESS",
              data: bookings,
            });
          } else {
            io.to(user.socketId).emit("action", {
              type: "MESSAGE",
              data: "NO BOOKING RECORDS FOUND",
            });
          }
        }
      } catch (error) {
        io.to(user.socketId).emit("action", {
          type: "MESSAGE",
          data: error.message,
        });
      }
    } else if (action.type === "server/venues") {
      try {
        if (user.isAdmin) {
          console.log("admin");
          let venues = await Venue.find();
          if (venues) {
            io.to(user.socketId).emit("action", {
              type: "VENUES_LIST_SUCCESS",
              data: venues,
            });
          } else {
            io.to(user.socketId).emit("action", {
              type: "MESSAGE",
              data: "NO VENUE RECORDS FOUND",
            });
          }
        } else {
          let venues = await Venue.find();
          if (venues) {
            io.to(user.socketId).emit("action", {
              type: "VENUES_LIST_SUCCESS",
              data: venues,
            });
          } else {
            io.to(user.socketId).emit("action", {
              type: "MESSAGE",
              data: "NO VENUE RECORDS FOUND",
            });
          }
        }
      } catch (error) {
        io.to(user.socketId).emit("action", {
          type: "MESSAGE",
          data: error.message,
        });
      }
    } else if (action.type === "server/bookingbyvenue") {
      try {
        if (user.isAdmin) {
          let bookings = await Booking.find({ venue: action.data }).populate(
            "venue"
          );
          if (bookings) {
            io.to(user.socketId).emit("action", {
              type: "BOOKING_LIST_SUCCESS",
              data: bookings,
            });
          } else {
            io.to(user.socketId).emit("action", {
              type: "MESSAGE",
              data: "NO BOOKINGS RECORDS FOUND",
            });
          }
        } else {
          let bookings = await Booking.find({ venue: action.data })
            .populate("venue")
            .select("-paid");
          if (bookings) {
            io.to(user.socketId).emit("action", {
              type: "BOOKING_LIST_SUCCESS",
              data: bookings,
            });
          } else {
            io.to(user.socketId).emit("action", {
              type: "MESSAGE",
              data: "NO BOOKINGS RECORDS FOUND",
            });
          }
        }
      } catch (error) {
        io.to(user.socketId).emit("action", {
          type: "MESSAGE",
          data: error.message,
        });
      }
    } else if (action.type === "server/editbooking") {
      try {
        const {
          name,
          telephone,
          date,
          venue,
          _id,
          mode,
          description,
          paid,
          cancelled,
        } = action.data;

        if (user.isAdmin) {
          const venueData = await Venue.findById(venue);
          console.log("admin");
          const booking = await Booking.findById(_id);
          if (booking) {
            booking.name = name;
            booking.telephone = telephone;
            booking.date = date;
            booking.mode = mode;
            booking.description = description;
            booking.paid = paid;
            booking.cancelled = cancelled;
            booking.venue = venueData;
          }
          const updatedBooking = await booking.save();
          if (updatedBooking) {
            io.to(user.socketId).emit("action", {
              type: "MESSAGE",
              data: "RECORD SAVED SUCCESSFULLY",
            });
          }
        } else {
          console.log("staff");
          io.to(user.socketId).emit("action", {
            type: "MESSAGE",
            data: "UNAUTHORIZED LOGIN!!!",
          });
        }
      } catch (error) {
        io.to(user.socketId).emit("action", {
          type: "MESSAGE",
          data: error.message,
        });
      }
    } else if (action.type === "server/bookingbyid") {
      try {
        if (user.isAdmin) {
          console.log("admin");
          let bookings = await Booking.findById(action.data).populate("venue");
          if (bookings) {
            io.to(user.socketId).emit("action", {
              type: "BOOKING_DETAILS_SUCCESS",
              payload: bookings,
            });
          } else {
            io.to(user.socketId).emit("action", {
              type: "MESSAGE",
              data: "NO BOOKINGS RECORDS FOUND",
            });
          }
        } else {
          let bookings = await Booking.find({ venue: action.data })
            .populate("venue")
            .select("-paid");
          if (bookings) {
            io.to(user.socketId).emit("action", {
              type: "BOOKING_LIST_SUCCESS",
              data: bookings,
            });
          } else {
            io.to(user.socketId).emit("action", {
              type: "MESSAGE",
              data: "NO BOOKINGS FOUND!!!",
            });
          }
        }
      } catch (error) {
        io.to(user.socketId).emit("action", {
          type: "MESSAGE",
          data: error.message,
        });
      }
    } else if (action.type === "server/addbooking") {
      try {
        if (user.isAdmin) {
          //get data save to database
          const { name, telephone, date, venue, mode, description, paid } =
            action.data;

          const venueData = await Venue.findById(venue);
          console.log(venueData);
          const booking = await Booking.create({
            name,
            telephone,
            date,
            venue: venueData,
            mode,
            description,
            paid,
          });

          if (booking) {
            io.to(user.socketId).emit("action", {
              type: "MESSAGE",
              data: "BOOKING SUCCESSFULLY SAVED !!!",
            });
          }
        } else {
          io.to(user.socketId).emit("action", {
            type: "MESSAGE",
            data: "UNAUTHORIZED LOGIN!!!",
          });
        }
      } catch (error) {}
    } else if (action.type === "server/deletebooking") {
      try {
        if (user.isAdmin) {
          console.log("admin");
          const { _id } = action.data;
          const booking = await Booking.findById(_id);
          if (booking) {
            await booking.remove();
            io.to(user.socketId).emit("action", {
              type: "MESSAGE",
              data: "BOOKING SUCCESSFULLY DELETED !!!",
            });
          } else {
            io.to(user.socketId).emit("action", {
              type: "MESSAGE",
              data: "NO RECORD FOUND !!!",
            });
          }
        } else {
          io.to(user.socketId).emit("action", {
            type: "MESSAGE",
            data: "UNAUTHORIZED LOGIN !!!",
          });
        }
      } catch (error) {
        io.to(user.socketId).emit("action", {
          type: "MESSAGE",
          data: error.message,
        });
      }
    } else if (action.type === "server/users") {
      try {
        if (user.isAdmin) {
          const users = await User.find();
          if (users) {
            io.to(user.socketId).emit("action", {
              type: "USER_LIST_SUCCESS",
              payload: users,
            });
          } else {
            io.to(user.socketId).emit("action", {
              type: "MESSAGE",
              data: "NO RECORD FOUND",
            });
          }
        } else {
          io.to(user.socketId).emit("action", {
            type: "MESSAGE",
            data: "UNAUTHORIZED LOGIN",
          });
        }
      } catch (error) {
        io.to(user.socketId).emit("action", {
          type: "MESSAGE",
          data: error.message,
        });
      }
    } else if (action.type === "server/adduser") {
      try {
        if (user.isAdmin) {
          const { name, email, password, phonenumber, username, isAdmin } =
            action.data;
          const userExists = await User.findOne({ email });
          if (userExists) {
            throw new Error("User already exists");
          }
          const user = await User.create({
            name,
            email,
            password,
            phonenumber,
            username,
            isAdmin,
          });
          if (user) {
            io.to(user.socketId).emit("action", {
              type: "MESSAGE",
              data: "USER SUCCESSFULLY SAVED",
            });
          }
        } else {
          io.to(user.socketId).emit("action", {
            type: "MESSAGE",
            data: "UNAUTHORIZED LOGIN!!!",
          });
        }
      } catch (error) {
        io.to(user.socketId).emit("action", {
          type: "MESSAGE",
          data: error.message,
        });
      }
    } else if (action.type === "server/edituser") {
      try {
        if (user.isAdmin) {
          const { name, email, password, phonenumber, username, isAdmin, _id } =
            action.data;
          const userg = await User.findById(_id);
          if (userg) {
            userg.name = name || userg.name;
            userg.email = email || userg.email;
            userg.isAdmin = isAdmin;
            userg.password = password || userg.password;
            userg.username = username || userg.username;
            userg.phonenumber = phonenumber || userg.phonenumber;
            userg.save();
          }
          io.to(user.socketId).emit("action", {
            type: "MESSAGE",
            data: "USER RECORD SUCCESSFULLY EDITED!!!",
          });
        } else {
          io.to(user.socketId).emit("action", {
            type: "MESSAGE",
            data: "UNAUTHORIZED LOGIN !!!",
          });
        }
      } catch (error) {
        io.to(user.socketId).emit("action", {
          type: "MESSAGE",
          data: error.message,
        });
      }
    } else if (action.type === "server/userbyid") {
      try {
        if (user.isAdmin) {
          let userg = await User.findById(action.data);

          io.to(user.socketId).emit("action", {
            type: "USER_DETAILS_SUCCESS",
            payload: userg,
          });

          //   .select("-password");
        } else {
          io.to(user.socketId).emit("action", {
            type: "MESSAGE",
            data: "UNAUTHORIZED LOGIN !!!",
          });
        }
      } catch (error) {
        io.to(user.socketId).emit("action", {
          type: "MESSAGE",
          data: error.message,
        });
      }
    } else if (action.type === "server/deleteuserbyid") {
      try {
        if (user.isAdmin) {
          const user = await User.findById(action.data);
          if (user) {
            user.remove();
            io.to(user.socketId).emit("action", {
              type: "MESSAGE",
              data: "RECORD SUCCESSFULLY DELETED",
            });
          }
        } else {
          io.to(user.socketId).emit("action", {
            type: "MESSAGE",
            data: "UNAUTHORIZED LOGIN !!!",
          });
        }
      } catch (error) {
        io.to(user.socketId).emit("action", {
          type: "MESSAGE",
          data: error.message,
        });
      }
    }
  });
});
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(___dirname, "/frontend/build")));
  app.get("*", (req, res) =>
    res.sendFile(path.resolve(___dirname, "frontend", "build", "index.html"))
  );
} else {
  app.get("/", (req, res) => {
    res.send("API is running");
  });
}
app.use(notFound);
app.use(errorHandler);
if (connectDB()) {
  server.listen(process.env.PORT, () => {
    console.log(`listening on *:${process.env.PORT}`);
  });
}
