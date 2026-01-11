// Vercel Serverless Function: initiate SwiftPay STK Push payment
const { supabase } = require('../functions/supabase');

const SWIFTPAY_API_KEY = process.env.SWIFTPAY_API_KEY;
const SWIFTPAY_TILL_ID = process.env.SWIFTPAY_TILL_ID;
const SWIFTPAY_BACKEND_URL =
  process.env.SWIFTPAY_BACKEND_URL || 'https://swiftpay-backend-uvv9.onrender.com';

function normalizePhoneNumber(phone) {
  if (!phone) return null;
  let cleaned = String(phone).replace(/[\s\-\(\)]/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '254' + cleaned.substring(1);
  }
  if (cleaned.length !== 12 || !/^\d+$/.test(cleaned)) {
    return null;
  }
  return cleaned;
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ success: false, message: 'Method not allowed' });
    return;
  }

  try {
    const { phoneNumber, amount = 149, description = 'FARE Account Activation', username, email } =
      req.body || {};

    if (!phoneNumber) {
      res.status(400).json({ success: false, message: 'Phone number is required' });
      return;
    }

    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    if (!normalizedPhone) {
      res.status(400).json({
        success: false,
        message: 'Invalid phone number format. Use 07XXXXXXXX or 254XXXXXXXXX',
      });
      return;
    }

    if (!SWIFTPAY_API_KEY || !SWIFTPAY_TILL_ID) {
      res.status(500).json({
        success: false,
        message: 'Payment configuration missing on server (SWIFTPAY_API_KEY / SWIFTPAY_TILL_ID)',
      });
      return;
    }

    const externalReference = `SURV-${Date.now()}`;

    if (username && email) {
      try {
        const ipAddress =
          (req.headers['x-forwarded-for'] || req.headers['client-ip'] || '').toString();
        const userAgent = (req.headers['user-agent'] || '').toString();

        await supabase.from('applications').insert({
          project_name: 'SURVAYREBORN',
          full_name: username,
          email: email,
          phone: phoneNumber,
          project_data: {
            accountType: 'premium',
            activationFee: amount,
            description: description,
            registeredAt: new Date().toISOString(),
          },
          payment_reference: externalReference,
          payment_status: 'unpaid',
          payment_amount: amount,
          ip_address: ipAddress.split(',')[0].trim(),
          user_agent: userAgent,
        });
      } catch (dbError) {
        // Continue with payment even if save fails
        console.error('Failed to save application data:', dbError);
      }
    }

    const swiftpayPayload = {
      phone_number: normalizedPhone,
      amount: amount,
      till_id: SWIFTPAY_TILL_ID,
    };

    const response = await fetch(`${SWIFTPAY_BACKEND_URL}/api/mpesa/stk-push-api`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SWIFTPAY_API_KEY}`,
      },
      body: JSON.stringify(swiftpayPayload),
    });

    const responseText = await response.text();

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      res.status(502).json({
        success: false,
        message: 'Invalid response from payment service',
      });
      return;
    }

    if (response.ok && (data.success === true || data.status === 'success')) {
      const checkoutId =
        data.data?.checkout_id ||
        data.data?.request_id ||
        data.CheckoutRequestID ||
        externalReference;

      try {
        await supabase.from('transactions').insert({
          transaction_request_id: checkoutId,
          amount: parseFloat(amount),
        });
      } catch (dbErr) {
        console.error('Database error:', dbErr);
      }

      res.status(200).json({
        success: true,
        message: 'Payment initiated successfully',
        data: {
          requestId: checkoutId,
          checkoutRequestId: checkoutId,
          transactionRequestId: checkoutId,
          externalReference: externalReference,
        },
      });
      return;
    }

    res.status(400).json({
      success: false,
      message: data.message || 'Payment initiation failed',
      details: data,
    });
  } catch (error) {
    console.error('Payment initiation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initiate payment',
      error: error?.message || String(error),
    });
  }
};
