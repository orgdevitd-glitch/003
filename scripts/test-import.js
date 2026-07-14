const fs = require('fs');
const path = require('path');

async function testImport() {
  const payloadPath = path.join(__dirname, '../data/sample-bitrix-payload.json');
  const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
  
  const token = "generate_a_secure_token_here"; // Shoud match .env.example default or your local .env
  
  try {
    const response = await fetch('http://localhost:3000/api/bitrix/projects/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });
    
    const result = await response.json();
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testImport();
