const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://dbpbvoqfexofyxcexmmp.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRicGJ2b3FmZXhvZnl4Y2V4bW1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkzNDc0NTMsImV4cCI6MjA3NDkyMzQ1M30.hGn7ux2xnRxseYCjiZfCLchgOEwIlIAUkdS6h7byZqc';

const supabase = createClient(supabaseUrl, supabaseKey);

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, message: 'Method not allowed' })
    };
  }

  try {
    const { 
      username,
      email, 
      phone,
      accountType,
      deviceType,
      referralCode,
      paymentReference
    } = JSON.parse(event.body);

    // Validate required fields
    if (!username || !email || !phone) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          success: false, 
          message: 'Missing required fields: username, email, phone' 
        })
      };
    }

    // Prepare project-specific data
    const projectData = {
      username: username || '',
      accountType: accountType || 'free',
      deviceType: deviceType || '',
      referralCode: referralCode || '',
      registeredAt: new Date().toISOString()
    };

    // Get client IP
    const ipAddress = event.headers['x-forwarded-for'] || event.headers['client-ip'] || '';
    const userAgent = event.headers['user-agent'] || '';

    // Insert into applications table
    const { data, error } = await supabase
      .from('applications')
      .insert({
        project_name: 'SURVAYREBORN',
        full_name: username,
        email: email,
        phone: phone,
        project_data: projectData,
        payment_reference: paymentReference || null,
        payment_status: 'unpaid',
        payment_amount: 149,
        ip_address: ipAddress.split(',')[0].trim(),
        user_agent: userAgent
      })
      .select()
      .single();

    if (error) {
      console.error('Database insert error:', error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          success: false, 
          message: 'Failed to save application',
          error: error.message 
        })
      };
    }

    console.log('Application saved successfully:', data.id);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Application submitted successfully',
        data: {
          applicationId: data.id,
          reference: data.payment_reference
        }
      })
    };

  } catch (error) {
    console.error('Submit application error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        message: 'Internal server error',
        error: error.message
      })
    };
  }
};
