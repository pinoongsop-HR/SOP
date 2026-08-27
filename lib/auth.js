const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_ME_INSECURE_DEFAULT';
const TOKEN_TTL = '12h';

function hashPin(pin) {
  return bcrypt.hashSync(String(pin), 10);
}
function verifyPin(pin, hash) {
  return bcrypt.compareSync(String(pin), hash);
}
function signToken(employee) {
  return jwt.sign(
    { id: employee.id, employeeCode: employee.employeeCode, position: employee.position, isAdmin: !!employee.isAdmin },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}
function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = { hashPin, verifyPin, signToken, verifyToken };
