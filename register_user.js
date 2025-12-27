const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

const USERS_FILE = path.join(__dirname, 'data', 'users.json');

// Ensure directory exists
if (!fs.existsSync(path.dirname(USERS_FILE))) {
    fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
}

// User details
const EMAIL = "esmaaail0110@gmail.com";
const PASSWORD = "123456";
const NAME = "Esmail"; // Default name

async function register() {
    let users = [];
    if (fs.existsSync(USERS_FILE)) {
        try {
            users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        } catch (e) {
            users = [];
        }
    }

    // Check if exists
    if (users.find(u => u.email === EMAIL)) {
        console.log("User already exists.");
        return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(PASSWORD, 10);

    const newUser = {
        id: randomUUID(),
        email: EMAIL,
        name: NAME,
        password: hashedPassword,
        createdAt: new Date().toISOString()
    };

    users.push(newUser);
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    console.log("User registered successfully:", newUser);
}

register();
