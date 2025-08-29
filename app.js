const express  = require("express");
const cors =  require("cors");
const exphbs = require("express-handlebars");
const bodyParser = require("body-parser");
const mysql = require("mysql2");
const nodemailer = require("nodemailer");
require("dotenv").config();


const app = express();
app.use(cors());

const port = process.env.PORT || 5000;

// Middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Static files
app.use(express.static("public"));

// Handlebars setup
const handlebars = exphbs.create({ extname: ".hbs" });
app.engine("hbs", handlebars.engine);
app.set("view engine", "hbs");

// DB connection
const con = mysql.createPool({
  connectionLimit: 5,
  host: process.env.MYSQL_ADDON_HOST,
  user: process.env.MYSQL_ADDON_USER,
  password: process.env.MYSQL_ADDON_PASSWORD,
  database: process.env.MYSQL_ADDON_DB
});

con.getConnection((err, connection) => {
  if (err) {
    console.error("MySQL connection error:", err);
    return;
  }
  console.log("MySQL connection successful!");
  connection.release();
});

// 🔧 Utility function (velila podanum)
function safeParseArray(str) {
  if (!str) return [];
  try {
    if (Array.isArray(str)) return str;
    return JSON.parse(str);
  } catch {
    if (typeof str === "string") {
      return str.split(",").map(s => s.trim());
    }
    return [];
  }
}

// Route 1 → Handlebars page
app.get("/", (req, res) => {
  con.query("SELECT * FROM jobs", (err, results) => {
    if (err) {
      console.error("Error fetching jobs:", err);
      return res.status(500).send("Database error");
    }

    results = results.map(job => ({
      ...job,
      benefits: safeParseArray(job.benefits),
      responsibilities: safeParseArray(job.responsibilities),
      requiredSkills: safeParseArray(job.requiredSkills),
      techSkills: safeParseArray(job.techSkills),
      softSkills: safeParseArray(job.softSkills),
    }));

    res.render("jobs", { apps: results });
  });
});

// Route 2 → JSON for frontend
app.get("/api/jobs", (req, res) => {
  const sql = "SELECT * FROM jobs"; 

  con.query(sql, (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ error: "Database query failed" });
    }

    if (!results || results.length === 0) {
      return res.json([]);
    }

    const jobs = results.map(job => ({
      id: job.id,
      title: job.title,
      company: job.company,
      location: job.location,
      description: job.description || "",
      salaryRange: job.salaryRange || "",
      benefits: safeParseArray(job.benefits),          
      responsibilities: safeParseArray(job.responsibilities),
      requiredSkills: safeParseArray(job.requiredSkills)
    }));

    res.json(jobs);
  });
});

app.post("/jobs/add", (req, res) => {
  const {
    title,
    company,
    location,
    workMode,
    description,
    salaryRange,
    benefits,
    responsibilities,
    requiredSkills,
    education,
    experience,
    techSkills,
    softSkills,
  } = req.body;

  const sql = `
    INSERT INTO jobs 
    (title, company, location, workMode, description, salaryRange, benefits, responsibilities, requiredSkills, education, experience, techSkills, softSkills) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  con.query(
    sql,
    [
      title,
      company,
      location,
      workMode,
      description,
      salaryRange,
      JSON.stringify(benefits || []),
      JSON.stringify(responsibilities || []),
      JSON.stringify(requiredSkills || []),
      education,
      experience,
      JSON.stringify(techSkills || []),
      JSON.stringify(softSkills || []),
    ],
    (err, result) => {
      if (err) {
        console.error("Insert error:", err);
        return res.status(500).json({ error: "Database insert failed" });
      }
      res.redirect("/");
    }
    
  );
});

// ❌ Delete Job
// Delete Job via form POST
app.post("/jobs/delete/:id", (req, res) => {
  const jobId = req.params.id;
  const sql = "DELETE FROM jobs WHERE id = ?";
  con.query(sql, [jobId], (err, result) => {
    if (err) {
      console.error("❌ Delete error:", err);
      return res.status(500).send("Failed to delete job");
    }
    if (result.affectedRows === 0) {
      return res.status(404).send("Job not found");
    }
    // redirect back to home page after deletion
    res.redirect("/");
  });
});


const fetchJobs = async () => {
  const res = await axios.get("http://localhost:5000/api/jobs");
  setJobs(res.data);
};

const handleSubmit = async (e) => {
  e.preventDefault();
  await axios.post("http://localhost:5000/jobs/add", {
    ...formData,
    benefits: formData.benefits.split(","),
    responsibilities: formData.responsibilities.split(","),
    requiredSkills: formData.requiredSkills.split(","),
    techSkills: formData.techSkills.split(","),
    softSkills: formData.softSkills.split(",")
  });
  fetchJobs();
};

const handleDelete = async (id) => {
  await axios.post(`http://localhost:5000/jobs/delete/${id}`);
  fetchJobs();
};




// Email route
app.post("/apply", (req, res) => {
  const {
    firstName,
    middleName,
    lastName,
    mobile,
    workAuth,
    jobTitle,
    email,
    country,
    address,
    state,
    city,
    zipcode
  } = req.body;

  // transporter setup
  const transporter = nodemailer.createTransport({
    service: "gmail", // or SMTP
    auth: {
      user: process.env.EMAIL_USER,   // 🔑 .env la set pannanum
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.TO_EMAIL, // un mail ku varanum
    subject: `New Job Application from ${firstName} ${lastName}`,
    html: `
      <h2>Job Application</h2>
      <p><b>Name:</b> ${firstName} ${middleName} ${lastName}</p>
      <p><b>Email:</b> ${email}</p>
      <p><b>Mobile:</b> ${mobile}</p>
      <p><b>Job Title:</b> ${jobTitle}</p>
      <p><b>Work Authorization:</b> ${workAuth}</p>
      <p><b>Address:</b> ${address}, ${city}, ${state}, ${zipcode}, ${country}</p>
    `
  };

  transporter.sendMail(mailOptions, (err, info) => {
    if (err) {
      console.error("❌ Mail error:", err);
      return res.status(500).json({ error: "Failed to send email" });
    }
    res.json({ success: true, message: "Application sent successfully!" });
  });
});



// Listen on port
app.listen(port, () => {
  console.log("Listening on port: " + port);
});




