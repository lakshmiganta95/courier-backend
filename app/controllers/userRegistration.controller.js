const db = require("../models");
const UserRegistration = db.userRegistration;
const User = db.user;
const Session = db.session;
const Op = db.Sequelize.Op;
const { encrypt, getSalt, hashPassword } = require("../authentication/crypto");
const Clerk = db.clerk;
const Courier = db.courier;

// Create and Save a new User
exports.create = async (req, res) => {
  // Validate request
  if (req.body.firstName === undefined) {
    const error = new Error("First name cannot be empty for user!");
    error.statusCode = 400;
    throw error;
  } else if (req.body.lastName === undefined) {
    const error = new Error("Last name cannot be empty for user!");
    error.statusCode = 400;
    throw error;
  } else if (req.body.email === undefined) {
    const error = new Error("Email cannot be empty for user!");
    error.statusCode = 400;
    throw error;
  } else if (req.body.password === undefined) {
    const error = new Error("Password cannot be empty for user!");
    error.statusCode = 400;
    throw error;
  } else if (req.body.userType === undefined) {
    const error = new Error("UserType cannot be empty for user!");
    error.statusCode = 400;
    throw error;
  }

  // find by email
  await UserRegistration.findOne({
    where: {
      email: req.body.email,
    },
  })
    .then(async (data) => {
      if (data) {
        return "This email is already in use.";
      } else {
        console.log("email not found");

        // Create a User
        const user = {
          id: req.body.id,
          firstName: req.body.firstName,
          lastName: req.body.lastName,
          email: req.body.email,
          userType: req.body.userType,
          password: req.body.password,
        };

        // Save User in the database
        await UserRegistration.create(user);
        res.send(user);
      }
    })
    .catch((err) => {
      return err.message || "Error retrieving User with email=" + email;
    });
};

// Retrieve all Users from the database.
exports.findAll = (req, res) => {
  const id = req.query.id;
  var condition = id ? { id: { [Op.like]: `%${id}%` } } : null;

  UserRegistration.findAll({ where: condition })
    .then((data) => {
      const result = data;
      for (let i = 0; i < data.length; i++) {
        data[i].password = "";
      }
      res.send(result);
    })
    .catch((err) => {
      res.status(500).send({
        message: err.message || "Some error occurred while retrieving users.",
      });
    });
};

// Find a single User with an id
exports.findOne = (req, res) => {
  const id = req.params.id;

  UserRegistration.findByPk(id)
    .then((data) => {
      if (data) {
        res.send(data);
      } else {
        res.status(404).send({
          message: `Cannot find User with id = ${id}.`,
        });
      }
    })
    .catch((err) => {
      res.status(500).send({
        message: err.message || "Error retrieving User with id = " + id,
      });
    });
};

// Find a single User with an email
exports.findByEmail = (req, res) => {
  const email = req.params.email;

  UserRegistration.findOne({
    where: {
      email: email,
    },
  })
    .then((data) => {
      if (data) {
        res.send(data);
      } else {
        res.send({ email: "not found" });
        /*res.status(404).send({
          message: `Cannot find User with email=${email}.`
        });*/
      }
    })
    .catch((err) => {
      res.status(500).send({
        message: err.message || "Error retrieving User with email=" + email,
      });
    });
};

// Update a User by the id in the request
exports.update = (req, res) => {
  const id = req.params.id;

  UserRegistration.update(req.body, {
    where: { id: id },
  })
    .then((number) => {
      if (number == 1) {
        res.send({
          message: "User was updated successfully.",
        });
      } else {
        res.send({
          message: `Cannot update User with id = ${id}. Maybe User was not found or req.body is empty!`,
        });
      }
    })
    .catch((err) => {
      res.status(500).send({
        message: err.message || "Error updating User with id =" + id,
      });
    });
};

// Delete a User with the specified id in the request
exports.delete = (req, res) => {
  const id = req.params.id;

  UserRegistration.destroy({
    where: { id: id },
  })
    .then((number) => {
      if (number == 1) {
        res.send({
          message: "User was deleted successfully!",
        });
      } else {
        res.send({
          message: `Cannot delete User with id = ${id}. Maybe User was not found!`,
        });
      }
    })
    .catch((err) => {
      res.status(500).send({
        message: err.message || "Could not delete User with id = " + id,
      });
    });
};

// Delete all People from the database.
exports.deleteAll = (req, res) => {
  UserRegistration.destroy({
    where: {},
    truncate: false,
  })
    .then((number) => {
      res.send({ message: `${number} People were deleted successfully!` });
    })
    .catch((err) => {
      res.status(500).send({
        message:
          err.message || "Some error occurred while removing all people.",
      });
    });
};

// Accept a single User with an id
exports.accept = (req, res) => {
  const id = req.params.id;

  UserRegistration.findByPk(id)
    .then(async (data) => {
      if (data) {
        UserRegistration.destroy({
          where: { id: id },
        });

        console.log(data);

        const requestBody = { ...data.dataValues };

        // find by email
        await User.findOne({
          where: {
            email: requestBody.email,
          },
        })
          .then(async (data) => {
            if (data) {
              return "This email is already in use.";
            } else {
              console.log("email not found");

              let salt = await getSalt();
              let hash = await hashPassword(requestBody.password, salt);

              // Create a User
              const user = {
                firstName: requestBody.firstName,
                lastName: requestBody.lastName,
                email: requestBody.email,
                userType: requestBody.userType,
                password: hash,
                salt: salt,
              };

              // Save User in the database
              await User.create(user)
                .then(async (data) => {
                  // Create a Session for the new user
                  let userId = data.id;

                  let expireTime = new Date();
                  expireTime.setDate(expireTime.getDate() + 1);

                  const session = {
                    email: requestBody.email,
                    userId: userId,
                    expirationDate: expireTime,
                  };
                  await Session.create(session).then(async (data) => {
                    let sessionId = data.id;
                    let token = await encrypt(sessionId);
                    let userInfo = {
                      email: user.email,
                      firstName: user.firstName,
                      lastName: user.lastName,
                      id: user.id,
                      token: token,
                    };

                    if (requestBody.userType === "clerk") {
                      try {
                        const clerkName =
                          requestBody.firstName + " " + requestBody.lastName;
                        const clerk = await Clerk.create({
                          ...requestBody,
                          clerkName,
                          userId: userId,
                        });
                      } catch (err) {
                        console.error(err);
                        res
                          .status(500)
                          .json({ error: "Failed to create clerk" });
                      }
                    } else if (requestBody.userType === "courier") {
                      try {
                        const courierName =
                          requestBody.firstName + " " + requestBody.lastName;
                        const courier = await Courier.create({
                          ...requestBody,
                          courierName,
                          userId: userId,
                        });
                      } catch (err) {
                        console.error(err);
                        res
                          .status(500)
                          .json({ error: "Failed to create courier" });
                      }
                    }
                  });
                })
                .catch((err) => {
                  console.log(err);
                  res.status(500).send({
                    message:
                      err.message ||
                      "Some error occurred while creating the User.",
                  });
                });
            }
          })
          .catch((err) => {
            return err.message || "Error retrieving User with email=" + email;
          });

        res.send(data);
      } else {
        res.status(404).send({
          message: `Cannot find User with id = ${id}.`,
        });
      }
    })
    .catch((err) => {
      res.status(500).send({
        message: err.message || "Error retrieving User with id = " + id,
      });
    });
  // delete in user register.
};

// decline a single User with an id
exports.decline = (req, res) => {
  const id = req.params.id;

  UserRegistration.findByPk(id)
    .then((data) => {
      if (data) {
        UserRegistration.destroy({
          where: { id: id },
        });
        res.send(data);
      } else {
        res.status(404).send({
          message: `Cannot find User with id = ${id}.`,
        });
      }
    })
    .catch((err) => {
      res.status(500).send({
        message: err.message || "Error retrieving User with id = " + id,
      });
    });
  // delete in user register.
};
