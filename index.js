const express = require('express');
const path = require('path');
const app = express();
const bodyParser = require('body-parser');
const cors = require('cors');
require('dotenv').config();
const SimpleWebAuthnServer = require('@simplewebauthn/server');
const base64url = require('base64url');
app.use(cors({ origin: '*' }));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
let users = {};
let challenges = {};
const rpId = 'localhost';
const expectedOrigin = ['http://localhost:3000'];
app.listen(process.env.PORT || 3000, err => {
  if (err) throw err;
  console.log('Server started on port', process.env.PORT || 3000);
});
app.use(express.static(path.join(__dirname, 'passkey-frontend/dist/passkey-frontend/browser')));


app.post('/register/start', (req, res) => {
  let username = req.body.username;
  let challenge = getNewChallenge();
  challenges[username] = convertChallenge(challenge);
  const pubKey = {
    challenge: challenge,
    rp: {id: rpId, name: 'webauthn-app'},
    user: {id: username, name: username, displayName: username},
    pubKeyCredParams: [
      {type: 'public-key', alg: -7},
      {type: 'public-key', alg: -257},
    ],
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'required',
      residentKey: 'preferred',
      requireResidentKey: false,
    }
  };
  res.json(pubKey);
});


app.post('/register/finish', async (req, res) => {
  const username = req.body.username;
  // Verify the attestation response
  let verification;
  try {
    verification = await SimpleWebAuthnServer.verifyRegistrationResponse({
      response: req.body.data,
      expectedChallenge: challenges[username],
      expectedOrigin:expectedOrigin
    });
  } catch (error) {
    console.error(error);
    return res.status(400).send({error: error.message});
  }
  const {verified, registrationInfo} = verification;
  if (verified) {
    users[username] = registrationInfo;
    return res.status(200).send({
      res: verified
    });
  }
  res.status(500).send({
    res: verified
  });
});
app.post('/login/start', (req, res) => {
  let username = req.body.username;
  if (!users[username]) {
    return res.status(404).send(false);
  }
  let challenge = getNewChallenge();
  challenges[username] = convertChallenge(challenge);
  res.json({
    challenge,
    rpId,
    allowCredentials: [{
      type: 'public-key',
      id: users[username].credentialID,
      transports: ['internal'],
    }],
    userVerification: 'preferred',
  });
});
app.post('/login/finish', async (req, res) => {
  let username = req.body.username;
  if (!users[username]) {
    return res.status(404).send(false);
  }
  let verification;
  try {
    const user = users[username];
    verification = await SimpleWebAuthnServer.verifyAuthenticationResponse({
      expectedChallenge: challenges[username],
      response: req.body.data,
      authenticator: user,
      expectedRPID: rpId,
      expectedOrigin,
      requireUserVerification: false
    });
  } catch (error) {
    console.error(error);
    return res.status(400).send({error: error.message});
  }
  const {verified} = verification;
  return res.status(200).send({
    res: verified
  });
});
function getNewChallenge() {
  return Math.random().toString(36).substring(2);
}
function convertChallenge(challenge) {
  return btoa(challenge).replaceAll('=', '');
}
