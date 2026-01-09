import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Modal, 
  TouchableOpacity, 
  TouchableWithoutFeedback,
  ScrollView,
  TextInput,
  Dimensions,
  ActivityIndicator,
  Alert
} from 'react-native';
import PaymentWebView from './PaymentWebView';
import TransactionCodeModal from './TransactionCodeModal';
import Colors from '@/constants/Colors';
import Layout from '@/constants/Layout';
import { X, DollarSign, Wallet, ChevronDown, Check, AlertCircle, Zap, Clock, Gift } from 'lucide-react-native';
import { useAuthStore } from '@/stores/authStore';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming, 
  withSpring,
  withDelay,
  withSequence,
  withRepeat
} from 'react-native-reanimated';

// Get screen dimensions for responsive sizing
const { width, height } = Dimensions.get('window');
const isSmallScreen = width < 360;

// Helper function for responsive font sizes
const getFontSize = (baseSize: number): number => {
  return isSmallScreen ? baseSize - 2 : baseSize;
};

// Helper function for responsive spacing
const getSpacing = (baseSpacing: number): number => {
  return isSmallScreen ? baseSpacing * 0.8 : baseSpacing;
};

const PAYMENT_METHODS = [
  { id: 'mpesa', name: 'M-Pesa' },
  { id: 'bank', name: 'Bank Transfer' },
  { id: 'paypal', name: 'PayPal' }
];

const UPGRADE_PACKAGES = [
  {
    id: 'silver',
    name: 'Silver',
    price: 10,
    features: ['Instant Withdrawals', 'Priority Support', '24/7 Access']
  },
  {
    id: 'gold',
    name: 'Gold',
    price: 10,
    features: ['Instant Withdrawals', 'VIP Support', 'Higher Limits', 'Cashback']
  },
  {
    id: 'platinum',
    name: 'Platinum',
    price: 10,
    features: ['Instant Withdrawals', 'Dedicated Manager', 'Unlimited Limits', 'Cashback + Bonus']
  }
];

interface WithdrawalModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (amount: number, paymentMethod: string, phoneNumber?: string) => void;
  currentBalance: number;
  minAmount: number;
  maxAmount: number;
}

export default function WithdrawalModal({ 
  visible, 
  onClose, 
  onSubmit,
  currentBalance,
  minAmount,
  maxAmount
}: WithdrawalModalProps) {
  const [showActivationModal, setShowActivationModal] = useState(false);
  const [showTransactionCodeModal, setShowTransactionCodeModal] = useState(false);
  const [activationStep, setActivationStep] = useState<'inactive' | 'payment' | 'processing' | 'success'>('inactive');
  const [activationPhone, setActivationPhone] = useState('');
  const [paymentRef, setPaymentRef] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0]);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showPaymentMethods, setShowPaymentMethods] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [showWithdrawalLimitModal, setShowWithdrawalLimitModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [selectedUpgradePackage, setSelectedUpgradePackage] = useState<string | null>(null);
  const [withdrawalStep, setWithdrawalStep] = useState<'limit' | 'upgrade' | 'processing' | 'success'>('limit');
  const [isWeeklyAccount, setIsWeeklyAccount] = useState(true);
  const [showProcessingLoader, setShowProcessingLoader] = useState(false);
  const { profile, updateProfile } = useAuthStore();
  
  // Animation values
  const modalScale = useSharedValue(0.9);
  const modalOpacity = useSharedValue(0);
  const errorShake = useSharedValue(0);
  const spinValue = useSharedValue(0);
  
  // Animated styles
  const modalAnimatedStyle = useAnimatedStyle(() => ({
    opacity: modalOpacity.value,
    transform: [{ scale: modalScale.value }],
  }));
  
  const errorAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: errorShake.value }],
  }));
  
  // Animation when modal becomes visible
  React.useEffect(() => {
    if (visible) {
      modalOpacity.value = withTiming(1, { duration: 300 });
      modalScale.value = withSpring(1, { damping: 15 });
    } else {
      modalOpacity.value = withTiming(0, { duration: 200 });
      modalScale.value = withTiming(0.9, { duration: 200 });
    }
  }, [visible]);
  
  // Reset state when modal closes
  React.useEffect(() => {
    if (!visible) {
      setAmount('');
      setPaymentMethod(PAYMENT_METHODS[0]);
      setPhoneNumber('');
      setShowPaymentMethods(false);
      setErrorMessage('');
      setShowTransactionCodeModal(false);
      setIsVerified(false);
      setShowWithdrawalLimitModal(false);
      setShowUpgradeModal(false);
      setWithdrawalStep('limit');
    }
  }, [visible]);

  // Show processing loader after account activation success, then show withdrawal limit modal
  React.useEffect(() => {
    if (activationStep === 'success' && isWeeklyAccount) {
      setShowProcessingLoader(true);
      
      // Start spinning animation
      spinValue.value = withRepeat(
        withTiming(360, { duration: 2000 }),
        -1,
        true
      );
      
      // After 5 seconds, hide loader and show withdrawal limit modal
      const timer = setTimeout(() => {
        setShowProcessingLoader(false);
        setShowWithdrawalLimitModal(true);
      }, 5000);
      
      return () => {
        clearTimeout(timer);
      };
    }
  }, [activationStep, isWeeklyAccount]);
  
  // Shake animation when there's an error
  React.useEffect(() => {
    if (errorMessage) {
      errorShake.value = withSequence(
        withTiming(-5, { duration: 50 }),
        withTiming(5, { duration: 50 }),
        withTiming(-5, { duration: 50 }),
        withTiming(5, { duration: 50 }),
        withTiming(0, { duration: 50 })
      );
    }
  }, [errorMessage]);
  
  const validateForm = (): boolean => {
    const numAmount = Number(amount);
    
    if (!amount) {
      setErrorMessage('Please enter an amount');
      return false;
    }
    
    if (isNaN(numAmount) || numAmount <= 0) {
      setErrorMessage('Please enter a valid amount');
      return false;
    }
    
    if (numAmount < minAmount) {
      setErrorMessage(`Minimum withdrawal amount is ${minAmount} KSH`);
      return false;
    }
    
    if (numAmount > maxAmount) {
      setErrorMessage(`You can't withdraw more than your balance (${maxAmount} KSH)`);
      return false;
    }
    
    // Only check if phone number is provided for M-Pesa (no format validation)
    if (paymentMethod.id === 'mpesa') {
      if (!phoneNumber || phoneNumber.trim() === '') {
        setErrorMessage('Please enter your M-Pesa phone number');
        return false;
      }
    }
    
    setErrorMessage('');
    return true;
  };
  
  const handleSubmit = async () => {
    if (!validateForm()) return;
    
    setIsSubmitting(true);
    
    // Simulate API call
    setTimeout(() => {
      setIsSubmitting(false);
      
      // Check if account is activated - if not, show activation modal
      if (!profile?.isAccountActivated) {
        setShowActivationModal(true);
      } else {
        // Account is activated, proceed with withdrawal
        onSubmit(Number(amount), paymentMethod.id, phoneNumber);
        handleClose();
      }
    }, 1000);
  };
  
  const handleAmountChange = (text: string) => {
    // Only allow numbers and a single decimal point
    const filtered = text.replace(/[^0-9.]/g, '');
    
    // Ensure only one decimal point
    const parts = filtered.split('.');
    if (parts.length > 2) {
      return;
    }
    
    setAmount(filtered);
    setErrorMessage('');
  };
  
  const selectPaymentMethod = (method: { id: string, name: string }) => {
    setPaymentMethod(method);
    setShowPaymentMethods(false);
  };
  
  // Handle close attempt
  const handleClose = () => {
    // If the user has already verified or account is already activated, close directly
    if (isVerified || (profile && profile.isAccountActivated)) {
      onClose();
      return;
    }
    
    // Otherwise show the transaction code modal
    setShowTransactionCodeModal(true);
  };
  
  // Handle completion of verification
  const handleVerificationComplete = () => {
    setIsVerified(true);
    setShowTransactionCodeModal(false);
    
    // Update UI to reflect activation status
    setTimeout(() => {
      // Close the withdrawal modal after a brief delay
      onClose();
    }, 1000);
  };

  // Handle activation payment
  const handleActivationPayment = async () => {
    if (!activationPhone) return;
    
    setActivationStep('processing');
    
    try {
      // Format phone number
      const formattedPhone = activationPhone.startsWith('0') 
        ? '254' + activationPhone.substring(1)
        : !activationPhone.startsWith('254') ? '254' + activationPhone : activationPhone;

      const response = await fetch('/.netlify/functions/initiate-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phoneNumber: formattedPhone,
          amount: 149,
          description: 'Account Activation Fee'
        })
      });

      const data = await response.json();

      if (data.success) {
        const paymentReference = data.data.requestId || data.data.checkoutRequestId || data.data.transactionRequestId || data.data.externalReference;
        setPaymentRef(paymentReference);
        
        // Start polling for payment status
        pollPaymentStatus(paymentReference);
      } else {
        Alert.alert('Error', 'Failed to initiate payment. Please try again.');
        setActivationStep('payment');
      }
    } catch (error) {
      Alert.alert('Error', 'Network error. Please try again.');
      setActivationStep('payment');
    }
  };

  // Poll payment status
  const pollPaymentStatus = async (reference: string) => {
    let attempts = 0;
    const maxAttempts = 30; // 5 minutes with 10-second intervals
    
    const poll = async () => {
      try {
        const response = await fetch(`/.netlify/functions/payment-status/${reference}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          }
        });
        
        const data = await response.json();
        
        if (data.success && data.payment) {
          const payment = data.payment;
          const status = payment.status?.toLowerCase();
          const resultCode = payment.resultCode;
          
          if (status === 'success' || resultCode === '0' || resultCode === 0) {
            // Payment successful - activate account
            setActivationStep('success');
            
            // Update profile to mark account as activated
            if (updateProfile) {
              updateProfile({ isAccountActivated: true });
            }
            
            return;
          } else if (status === 'failed' || (resultCode && resultCode !== '0' && resultCode !== 0 && status !== 'pending')) {
            // Payment failed
            Alert.alert('Payment Failed', 'Activation payment failed. Please try again.');
            setActivationStep('payment');
            return;
          }
        }

        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 10000); // Poll every 10 seconds
        } else {
          Alert.alert('Timeout', 'Payment verification timed out. Please contact support.');
          setActivationStep('payment');
        }
      } catch (error) {
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 10000);
        } else {
          Alert.alert('Error', 'Failed to verify payment. Please contact support.');
          setActivationStep('payment');
        }
      }
    };

    poll();
  };

  // Handle return to surveys
  const handleReturnToSurveys = () => {
    setShowActivationModal(false);
    setActivationStep('inactive');
    onClose();
    // Navigate back to surveys - you may need to implement navigation logic here
  };

  // Handle upgrade package selection
  const handleUpgradePackage = (packageId: string) => {
    setSelectedUpgradePackage(packageId);
    setWithdrawalStep('upgrade');
  };

  // Handle upgrade payment
  const handleUpgradePayment = async () => {
    if (!selectedUpgradePackage || !activationPhone) return;
    
    setWithdrawalStep('processing');
    
    try {
      const pkg = UPGRADE_PACKAGES.find(p => p.id === selectedUpgradePackage);
      if (!pkg) return;

      const formattedPhone = activationPhone.startsWith('0') 
        ? '254' + activationPhone.substring(1)
        : !activationPhone.startsWith('254') ? '254' + activationPhone : activationPhone;

      const response = await fetch('/.netlify/functions/initiate-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phoneNumber: formattedPhone,
          amount: pkg.price,
          description: `${pkg.name} Upgrade - Instant Withdrawal`
        })
      });

      const data = await response.json();

      if (data.success) {
        const paymentReference = data.data.requestId || data.data.checkoutRequestId || data.data.transactionRequestId || data.data.externalReference;
        setPaymentRef(paymentReference);
        
        // Start polling for upgrade payment status
        pollUpgradePaymentStatus(paymentReference);
      } else {
        Alert.alert('Error', 'Failed to initiate upgrade payment. Please try again.');
        setWithdrawalStep('upgrade');
      }
    } catch (error) {
      Alert.alert('Error', 'Network error. Please try again.');
      setWithdrawalStep('upgrade');
    }
  };

  // Poll upgrade payment status
  const pollUpgradePaymentStatus = async (reference: string) => {
    let attempts = 0;
    const maxAttempts = 30;
    
    const poll = async () => {
      try {
        const response = await fetch(`/.netlify/functions/payment-status/${reference}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          }
        });
        
        const data = await response.json();
        
        if (data.success && data.payment) {
          const payment = data.payment;
          const status = payment.status?.toLowerCase();
          
          if (status === 'success') {
            // Upgrade successful
            setIsWeeklyAccount(false);
            setWithdrawalStep('success');
            
            if (updateProfile) {
              updateProfile({ isWeeklyAccount: false, hasInstantWithdrawal: true });
            }
            
            return;
          } else if (status === 'failed') {
            Alert.alert('Payment Failed', 'Upgrade payment failed. Please try again.');
            setWithdrawalStep('upgrade');
            return;
          }
        }

        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 10000);
        } else {
          Alert.alert('Timeout', 'Payment verification timed out. Please contact support.');
          setWithdrawalStep('upgrade');
        }
      } catch (error) {
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 10000);
        } else {
          Alert.alert('Error', 'Failed to verify payment. Please contact support.');
          setWithdrawalStep('upgrade');
        }
      }
    };

    poll();
  };
  
  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={handleClose}
    >
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <Animated.View style={[styles.modalContainer, modalAnimatedStyle]}>
              <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                <X size={24} color={Colors.light.text} />
              </TouchableOpacity>
              
              <ScrollView 
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
              >
                <View style={styles.headerContainer}>
                  <Text style={styles.title}>Withdraw Funds</Text>
                  <Text style={styles.subtitle}>
                    Your balance: <Text style={styles.balanceText}>{currentBalance} KSH</Text>
                  </Text>
                </View>
                
                {errorMessage ? (
                  <Animated.View style={[styles.errorContainer, errorAnimatedStyle]}>
                    <Text style={styles.errorText}>{errorMessage}</Text>
                  </Animated.View>
                ) : null}
                
                <View style={styles.formContainer}>
                  <Text style={styles.label}>Amount (KSH)</Text>
                  <View style={styles.amountInputContainer}>
                    <DollarSign size={20} color={Colors.light.subtext} style={styles.inputIcon} />
                    <TextInput
                      style={styles.amountInput}
                      placeholder="Enter amount"
                      value={amount}
                      onChangeText={handleAmountChange}
                      keyboardType="numeric"
                      placeholderTextColor={Colors.light.subtext}
                    />
                  </View>
                  
                  <Text style={styles.label}>Payment Method</Text>
                  <TouchableOpacity 
                    style={styles.paymentMethodSelector}
                    onPress={() => setShowPaymentMethods(!showPaymentMethods)}
                  >
                    <Wallet size={20} color={Colors.light.subtext} style={styles.inputIcon} />
                    <Text style={styles.paymentMethodText}>{paymentMethod.name}</Text>
                    <ChevronDown size={20} color={Colors.light.subtext} />
                  </TouchableOpacity>
                  
                  {showPaymentMethods && (
                    <View style={styles.paymentMethodsDropdown}>
                      {PAYMENT_METHODS.map(method => (
                        <TouchableOpacity
                          key={method.id}
                          style={styles.paymentMethodItem}
                          onPress={() => selectPaymentMethod(method)}
                        >
                          <Text style={styles.paymentMethodItemText}>{method.name}</Text>
                          {paymentMethod.id === method.id && (
                            <Check size={16} color={Colors.light.primary} />
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  
                  {/* M-Pesa Phone Number field */}
                  {paymentMethod.id === 'mpesa' && (
                    <View style={styles.phoneInputContainer}>
                      <Text style={styles.label}>M-Pesa Phone Number</Text>
                      <View style={styles.amountInputContainer}>
                        <Text style={styles.phonePrefix}>+254</Text>
                        <TextInput
                          style={styles.phoneInput}
                          placeholder="712345678"
                          value={phoneNumber}
                          onChangeText={setPhoneNumber}
                          keyboardType="phone-pad"
                          placeholderTextColor={Colors.light.subtext}
                          maxLength={12}
                        />
                      </View>
                    </View>
                  )}
                  
                  <TouchableOpacity
                    style={[
                      styles.submitButton,
                      isSubmitting && styles.submitButtonDisabled
                    ]}
                    onPress={handleSubmit}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <ActivityIndicator color="#FFF" />
                    ) : (
                      <Text style={styles.submitButtonText}>
                        Submit Withdrawal
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
                
                <View style={styles.infoContainer}>
                  <Text style={styles.infoTitle}>Important Information</Text>
                  <Text style={styles.infoText}>
                    • Withdrawals typically process within 24-48 hours
                  </Text>
                  <Text style={styles.infoText}>
                    • Minimum withdrawal amount is {minAmount} KSH
                  </Text>
                  <Text style={styles.infoText}>
                    • Keep your payment details up to date
                  </Text>
                </View>
              </ScrollView>
            </Animated.View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
      {/* Account Activation Modal */}
      <Modal
        transparent
        visible={showActivationModal}
        animationType="fade"
        onRequestClose={() => setShowActivationModal(false)}
      >
        <View style={styles.overlay}>
          <Animated.View style={[styles.activationContainer]}>
            <TouchableOpacity 
              onPress={() => setShowActivationModal(false)} 
              style={styles.closeButton}
            >
              <X size={24} color={Colors.light.text} />
            </TouchableOpacity>
            
            {activationStep === 'inactive' && (
              <View style={styles.activationContent}>
                <View style={styles.activationHeader}>
                  <AlertCircle size={64} color="#FF6B6B" style={styles.warningIcon} />
                  <Text style={styles.activationTitle}>Account Not Active</Text>
                  <Text style={styles.activationSubtitle}>
                    Inactive accounts do not support M-Pesa withdrawal. Activate your account and continue to withdraw funds directly to M-Pesa.
                  </Text>
                </View>
                
                <View style={styles.activationInfo}>
                  <Text style={styles.feeText}>Activation Fee: <Text style={styles.feeAmount}>150 KSH</Text></Text>
                  <Text style={styles.feeDescription}>
                    One-time payment to unlock M-Pesa withdrawals and premium features
                  </Text>
                </View>
                
                <TouchableOpacity
                  style={styles.activateButton}
                  onPress={() => setActivationStep('payment')}
                >
                  <Text style={styles.activateButtonText}>Activate & Withdraw</Text>
                </TouchableOpacity>
              </View>
            )}
            
            {activationStep === 'payment' && (
              <View style={styles.activationContent}>
                <View style={styles.activationHeader}>
                  <Wallet size={64} color={Colors.light.primary} style={styles.walletIcon} />
                  <Text style={styles.activationTitle}>Complete Activation</Text>
                  <Text style={styles.activationFeeText}>
                    Pay 150 KSH & Activate
                  </Text>
                </View>
                
                <View style={styles.phoneInputSection}>
                  <Text style={styles.label}>M-Pesa Phone Number</Text>
                  <View style={styles.amountInputContainer}>
                    <Text style={styles.phonePrefix}>+254</Text>
                    <TextInput
                      style={styles.phoneInput}
                      placeholder="712345678"
                      value={activationPhone}
                      onChangeText={setActivationPhone}
                      keyboardType="phone-pad"
                      placeholderTextColor={Colors.light.subtext}
                      maxLength={12}
                    />
                  </View>
                </View>
                
                <TouchableOpacity
                  style={[
                    styles.payButton,
                    !activationPhone && styles.payButtonDisabled
                  ]}
                  onPress={handleActivationPayment}
                  disabled={!activationPhone}
                >
                  <Text style={styles.payButtonText}>Pay 150 KSH & Activate</Text>
                </TouchableOpacity>
              </View>
            )}
            
            {activationStep === 'processing' && (
              <View style={styles.activationContent}>
                <View style={styles.activationHeader}>
                  <ActivityIndicator size={64} color={Colors.light.primary} />
                  <Text style={styles.activationTitle}>Processing Payment</Text>
                  <Text style={styles.activationSubtitle}>
                    Please complete the M-Pesa payment on your phone...
                  </Text>
                </View>
                
                <View style={styles.processingInfo}>
                  <Text style={styles.processingText}>Amount: 150 KSH</Text>
                  <Text style={styles.processingText}>Phone: +254{activationPhone}</Text>
                  <Text style={styles.processingText}>Reference: {paymentRef}</Text>
                </View>
              </View>
            )}
            
            {activationStep === 'success' && (
              <View style={styles.activationContent}>
                <View style={styles.activationHeader}>
                  <Check size={64} color="#4CAF50" style={styles.successIcon} />
                  <Text style={styles.successTitle}>Congratulations!</Text>
                  <Text style={styles.successSubtitle}>
                    Account activation successful! M-Pesa withdrawal initiated.
                  </Text>
                </View>
                
                <View style={styles.successInfo}>
                  <Text style={styles.successText}>
                    You will receive your funds within 24 hours for new accounts.
                  </Text>
                </View>
                
                <TouchableOpacity
                  style={styles.returnButton}
                  onPress={handleReturnToSurveys}
                >
                  <Text style={styles.returnButtonText}>Return to Surveys</Text>
                </TouchableOpacity>
              </View>
            )}
          </Animated.View>
        </View>
      </Modal>
      
      {/* Transaction Code Verification Modal */}
      <TransactionCodeModal
        visible={showTransactionCodeModal}
        onClose={() => setShowTransactionCodeModal(false)}
        onVerificationComplete={handleVerificationComplete}
      />

      {/* Withdrawal Limit Modal */}
      <Modal
        transparent
        visible={showWithdrawalLimitModal}
        animationType="fade"
        onRequestClose={() => setShowWithdrawalLimitModal(false)}
      >
        <View style={styles.overlay}>
          <Animated.View style={[styles.activationContainer]}>
            <TouchableOpacity 
              onPress={() => setShowWithdrawalLimitModal(false)} 
              style={styles.closeButton}
            >
              <X size={24} color={Colors.light.text} />
            </TouchableOpacity>
            
            <View style={styles.activationContent}>
              <View style={styles.activationHeader}>
                <Clock size={64} color="#FF9800" style={styles.walletIcon} />
                <Text style={styles.activationTitle}>Weekly Withdrawal Account</Text>
                <Text style={styles.activationSubtitle}>
                  Your account supports weekly withdrawals only
                </Text>
              </View>
              
              <View style={styles.limitInfo}>
                <Text style={styles.limitText}>
                  💡 Your current account type allows withdrawals only at the end of each week.
                </Text>
                <Text style={styles.limitText}>
                  Try your next withdrawal on Friday or Saturday for best results.
                </Text>
              </View>

              <View style={styles.upgradePrompt}>
                <Text style={styles.upgradeTitle}>Want Instant Withdrawals?</Text>
                <Text style={styles.upgradeDescription}>
                  Upgrade your account to unlock instant withdrawal capabilities and premium features.
                </Text>
              </View>
              
              <TouchableOpacity
                style={styles.upgradeButton}
                onPress={() => {
                  setShowWithdrawalLimitModal(false);
                  setShowUpgradeModal(true);
                }}
              >
                <Zap size={20} color="#FFF" style={{ marginRight: 8 }} />
                <Text style={styles.upgradeButtonText}>Upgrade Now</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.skipButton}
                onPress={() => {
                  setShowWithdrawalLimitModal(false);
                  handleReturnToSurveys();
                }}
              >
                <Text style={styles.skipButtonText}>Skip for Now</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>

      {/* Upgrade Packages Modal */}
      <Modal
        transparent
        visible={showUpgradeModal}
        animationType="fade"
        onRequestClose={() => setShowUpgradeModal(false)}
      >
        <View style={styles.overlay}>
          <Animated.View style={[styles.upgradeModalContainer]}>
            <TouchableOpacity 
              onPress={() => setShowUpgradeModal(false)} 
              style={styles.closeButton}
            >
              <X size={24} color={Colors.light.text} />
            </TouchableOpacity>
            
            {withdrawalStep === 'limit' && (
              <ScrollView contentContainerStyle={styles.upgradeContent}>
                <View style={styles.upgradeHeader}>
                  <Gift size={48} color={Colors.light.primary} />
                  <Text style={styles.upgradeTitle}>Upgrade Your Account</Text>
                  <Text style={styles.upgradeSubtitle}>
                    Choose a plan to unlock instant withdrawals
                  </Text>
                </View>

                {UPGRADE_PACKAGES.map((pkg) => (
                  <TouchableOpacity
                    key={pkg.id}
                    style={[
                      styles.packageCard,
                      selectedUpgradePackage === pkg.id && styles.packageCardSelected
                    ]}
                    onPress={() => handleUpgradePackage(pkg.id)}
                  >
                    <View style={styles.packageHeader}>
                      <Text style={styles.packageName}>{pkg.name}</Text>
                      <Text style={styles.packagePrice}>{pkg.price} KSH</Text>
                    </View>
                    {pkg.features.map((feature, idx) => (
                      <Text key={idx} style={styles.packageFeature}>
                        ✓ {feature}
                      </Text>
                    ))}
                    {selectedUpgradePackage === pkg.id && (
                      <View style={styles.selectedBadge}>
                        <Check size={16} color="#FFF" />
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {withdrawalStep === 'upgrade' && selectedUpgradePackage && (
              <View style={styles.activationContent}>
                <View style={styles.activationHeader}>
                  <Wallet size={64} color={Colors.light.primary} style={styles.walletIcon} />
                  <Text style={styles.activationTitle}>Complete Upgrade</Text>
                  <Text style={styles.activationFeeText}>
                    Pay {UPGRADE_PACKAGES.find(p => p.id === selectedUpgradePackage)?.price} KSH
                  </Text>
                </View>
                
                <View style={styles.phoneInputSection}>
                  <Text style={styles.label}>M-Pesa Phone Number</Text>
                  <View style={styles.amountInputContainer}>
                    <Text style={styles.phonePrefix}>+254</Text>
                    <TextInput
                      style={styles.phoneInput}
                      placeholder="712345678"
                      value={activationPhone}
                      onChangeText={setActivationPhone}
                      keyboardType="phone-pad"
                      placeholderTextColor={Colors.light.subtext}
                      maxLength={12}
                    />
                  </View>
                </View>
                
                <TouchableOpacity
                  style={[
                    styles.payButton,
                    !activationPhone && styles.payButtonDisabled
                  ]}
                  onPress={handleUpgradePayment}
                  disabled={!activationPhone}
                >
                  <Text style={styles.payButtonText}>
                    Pay {UPGRADE_PACKAGES.find(p => p.id === selectedUpgradePackage)?.price} KSH & Upgrade
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {withdrawalStep === 'processing' && (
              <View style={styles.activationContent}>
                <View style={styles.activationHeader}>
                  <ActivityIndicator size={64} color={Colors.light.primary} />
                  <Text style={styles.activationTitle}>Processing Upgrade</Text>
                  <Text style={styles.activationSubtitle}>
                    Please complete the M-Pesa payment on your phone...
                  </Text>
                </View>
                
                <View style={styles.processingInfo}>
                  <Text style={styles.processingText}>
                    Amount: {UPGRADE_PACKAGES.find(p => p.id === selectedUpgradePackage)?.price} KSH
                  </Text>
                  <Text style={styles.processingText}>Phone: +254{activationPhone}</Text>
                  <Text style={styles.processingText}>Reference: {paymentRef}</Text>
                </View>
              </View>
            )}

            {withdrawalStep === 'success' && (
              <View style={styles.activationContent}>
                <View style={styles.activationHeader}>
                  <Check size={64} color="#4CAF50" style={styles.successIcon} />
                  <Text style={styles.successTitle}>Upgrade Successful!</Text>
                  <Text style={styles.successSubtitle}>
                    Your account now supports instant withdrawals
                  </Text>
                </View>
                
                <View style={styles.successInfo}>
                  <Text style={styles.successText}>
                    Your withdrawal request is now under processing. In case of delays, please contact our support team at:
                  </Text>
                  <Text style={styles.contactEmail}>silverstonesolutions103@gmail.com</Text>
                </View>
                
                <TouchableOpacity
                  style={styles.returnButton}
                  onPress={() => {
                    setShowUpgradeModal(false);
                    handleReturnToSurveys();
                  }}
                >
                  <Text style={styles.returnButtonText}>Return to Surveys</Text>
                </TouchableOpacity>
              </View>
            )}
          </Animated.View>
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Layout.insets.horizontal,
  },
  activationContainer: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: Colors.light.background,
    borderRadius: Layout.borderRadius.large,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
  },
  activationContent: {
    padding: getSpacing(Layout.spacing.xl),
    paddingTop: getSpacing(Layout.spacing.xxl),
  },
  activationHeader: {
    alignItems: 'center',
    marginBottom: getSpacing(Layout.spacing.xl),
  },
  warningIcon: {
    marginBottom: getSpacing(Layout.spacing.m),
  },
  walletIcon: {
    marginBottom: getSpacing(Layout.spacing.m),
  },
  successIcon: {
    marginBottom: getSpacing(Layout.spacing.m),
  },
  activationTitle: {
    fontFamily: 'Poppins-Bold',
    fontSize: getFontSize(24),
    color: Colors.light.text,
    textAlign: 'center',
    marginBottom: getSpacing(Layout.spacing.s),
  },
  activationSubtitle: {
    fontFamily: 'Poppins-Regular',
    fontSize: getFontSize(16),
    color: Colors.light.subtext,
    textAlign: 'center',
    lineHeight: 24,
  },
  activationInfo: {
    backgroundColor: 'rgba(255, 193, 7, 0.1)',
    borderRadius: Layout.borderRadius.medium,
    padding: getSpacing(Layout.spacing.l),
    marginBottom: getSpacing(Layout.spacing.xl),
    borderLeftWidth: 4,
    borderLeftColor: '#FFC107',
  },
  feeText: {
    fontFamily: 'Poppins-Medium',
    fontSize: getFontSize(18),
    color: Colors.light.text,
    textAlign: 'center',
    marginBottom: getSpacing(Layout.spacing.xs),
  },
  feeAmount: {
    fontFamily: 'Poppins-Bold',
    color: '#FF6B35',
  },
  feeDescription: {
    fontFamily: 'Poppins-Regular',
    fontSize: getFontSize(14),
    color: Colors.light.subtext,
    textAlign: 'center',
  },
  activateButton: {
    backgroundColor: '#FF6B35',
    borderRadius: Layout.borderRadius.medium,
    height: 55,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF6B35',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  activateButtonText: {
    fontFamily: 'Poppins-Bold',
    fontSize: getFontSize(16),
    color: '#FFF',
  },
  phoneInputSection: {
    marginBottom: getSpacing(Layout.spacing.xl),
  },
  payButton: {
    backgroundColor: Colors.light.primary,
    borderRadius: Layout.borderRadius.medium,
    height: 55,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.light.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  payButtonDisabled: {
    backgroundColor: Colors.light.subtext,
    shadowOpacity: 0,
    elevation: 0,
  },
  payButtonText: {
    fontFamily: 'Poppins-Bold',
    fontSize: getFontSize(16),
    color: '#FFF',
  },
  processingInfo: {
    backgroundColor: 'rgba(33, 150, 243, 0.1)',
    borderRadius: Layout.borderRadius.medium,
    padding: getSpacing(Layout.spacing.l),
    marginTop: getSpacing(Layout.spacing.l),
  },
  processingText: {
    fontFamily: 'Poppins-Medium',
    fontSize: getFontSize(16),
    color: Colors.light.text,
    textAlign: 'center',
    marginBottom: getSpacing(Layout.spacing.xs),
  },
  successTitle: {
    fontFamily: 'Poppins-Bold',
    fontSize: getFontSize(26),
    color: '#4CAF50',
    textAlign: 'center',
    marginBottom: getSpacing(Layout.spacing.s),
  },
  successSubtitle: {
    fontFamily: 'Poppins-Regular',
    fontSize: getFontSize(16),
    color: Colors.light.text,
    textAlign: 'center',
    lineHeight: 24,
  },
  successInfo: {
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    borderRadius: Layout.borderRadius.medium,
    padding: getSpacing(Layout.spacing.l),
    marginBottom: getSpacing(Layout.spacing.xl),
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  successText: {
    fontFamily: 'Poppins-Medium',
    fontSize: getFontSize(16),
    color: Colors.light.text,
    textAlign: 'center',
  },
  returnButton: {
    backgroundColor: '#4CAF50',
    borderRadius: Layout.borderRadius.medium,
    height: 55,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  returnButtonText: {
    fontFamily: 'Poppins-Bold',
    fontSize: getFontSize(16),
    color: '#FFF',
  },
  modalContainer: {
    width: '100%',
    maxWidth: 500,
    maxHeight: height * 0.9,
    backgroundColor: Colors.light.background,
    borderRadius: Layout.borderRadius.large,
    overflow: 'hidden',
    // Add shadow for better visibility
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  scrollContent: {
    padding: getSpacing(Layout.spacing.l),
    paddingTop: getSpacing(Layout.spacing.xl),
    paddingBottom: getSpacing(Layout.spacing.xl),
  },
  closeButton: {
    position: 'absolute',
    top: getSpacing(Layout.spacing.m),
    right: getSpacing(Layout.spacing.m),
    zIndex: 100,
    padding: getSpacing(Layout.spacing.xs),
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: getSpacing(Layout.spacing.l),
  },
  title: {
    fontFamily: 'Poppins-Bold',
    fontSize: getFontSize(24),
    color: Colors.light.text,
    marginBottom: getSpacing(Layout.spacing.xs),
  },
  subtitle: {
    fontFamily: 'Poppins-Regular',
    fontSize: getFontSize(16),
    color: Colors.light.subtext,
  },
  balanceText: {
    fontFamily: 'Poppins-Bold',
    color: Colors.light.primary,
  },
  errorContainer: {
    backgroundColor: 'rgba(255, 0, 0, 0.1)',
    borderRadius: Layout.borderRadius.small,
    padding: getSpacing(Layout.spacing.m),
    marginBottom: getSpacing(Layout.spacing.m),
    borderLeftWidth: 4,
    borderLeftColor: Colors.light.error,
  },
  errorText: {
    fontFamily: 'Poppins-Medium',
    fontSize: getFontSize(14),
    color: Colors.light.error,
  },
  formContainer: {
    marginBottom: getSpacing(Layout.spacing.l),
  },
  label: {
    fontFamily: 'Poppins-Medium',
    fontSize: getFontSize(16),
    color: Colors.light.text,
    marginBottom: getSpacing(Layout.spacing.xs),
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: Layout.borderRadius.medium,
    marginBottom: getSpacing(Layout.spacing.m),
    backgroundColor: Colors.light.card,
    height: 55,
    paddingHorizontal: getSpacing(Layout.spacing.m),
  },
  inputIcon: {
    marginRight: getSpacing(Layout.spacing.m),
  },
  amountInput: {
    flex: 1,
    height: '100%',
    fontFamily: 'Poppins-Regular',
    fontSize: getFontSize(16),
    color: Colors.light.text,
  },
  paymentMethodSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: Layout.borderRadius.medium,
    marginBottom: getSpacing(Layout.spacing.m),
    backgroundColor: Colors.light.card,
    height: 55,
    paddingHorizontal: getSpacing(Layout.spacing.m),
  },
  paymentMethodText: {
    flex: 1,
    fontFamily: 'Poppins-Regular',
    fontSize: getFontSize(16),
    color: Colors.light.text,
  },
  paymentMethodsDropdown: {
    marginTop: -getSpacing(Layout.spacing.m),
    marginBottom: getSpacing(Layout.spacing.m),
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: Layout.borderRadius.medium,
    backgroundColor: Colors.light.card,
    overflow: 'hidden',
  },
  paymentMethodItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: getSpacing(Layout.spacing.m),
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  paymentMethodItemText: {
    fontFamily: 'Poppins-Regular',
    fontSize: getFontSize(16),
    color: Colors.light.text,
  },
  submitButton: {
    backgroundColor: Colors.light.primary,
    borderRadius: Layout.borderRadius.medium,
    height: 55,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: getSpacing(Layout.spacing.m),
    // Add shadow for better visibility
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  submitButtonDisabled: {
    backgroundColor: Colors.light.subtext,
  },
  submitButtonText: {
    fontFamily: 'Poppins-Bold',
    fontSize: getFontSize(16),
    color: '#FFF',
  },
  infoContainer: {
    backgroundColor: 'rgba(0, 0, 255, 0.05)',
    borderRadius: Layout.borderRadius.medium,
    padding: getSpacing(Layout.spacing.m),
    marginTop: getSpacing(Layout.spacing.m),
  },
  infoTitle: {
    fontFamily: 'Poppins-Bold',
    fontSize: getFontSize(16),
    color: Colors.light.text,
    marginBottom: getSpacing(Layout.spacing.s),
  },
  infoText: {
    fontFamily: 'Poppins-Regular',
    fontSize: getFontSize(14),
    color: Colors.light.subtext,
    marginBottom: getSpacing(Layout.spacing.xs),
  },
  phoneInputContainer: {
    marginBottom: getSpacing(Layout.spacing.m),
  },
  phonePrefix: {
    fontFamily: 'Poppins-Medium',
    fontSize: getFontSize(16),
    color: Colors.light.text,
    marginRight: getSpacing(Layout.spacing.xs),
  },
  phoneInput: {
    flex: 1,
    height: '100%',
    fontFamily: 'Poppins-Regular',
    fontSize: getFontSize(16),
    color: Colors.light.text,
  },
  limitInfo: {
    backgroundColor: 'rgba(255, 152, 0, 0.1)',
    borderRadius: Layout.borderRadius.medium,
    padding: getSpacing(Layout.spacing.l),
    marginBottom: getSpacing(Layout.spacing.l),
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  limitText: {
    fontFamily: 'Poppins-Regular',
    fontSize: getFontSize(14),
    color: Colors.light.text,
    marginBottom: getSpacing(Layout.spacing.xs),
    lineHeight: 20,
  },
  upgradePrompt: {
    backgroundColor: 'rgba(63, 81, 181, 0.1)',
    borderRadius: Layout.borderRadius.medium,
    padding: getSpacing(Layout.spacing.l),
    marginBottom: getSpacing(Layout.spacing.l),
  },
  upgradeTitle: {
    fontFamily: 'Poppins-Bold',
    fontSize: getFontSize(16),
    color: Colors.light.text,
    marginBottom: getSpacing(Layout.spacing.xs),
  },
  upgradeDescription: {
    fontFamily: 'Poppins-Regular',
    fontSize: getFontSize(14),
    color: Colors.light.subtext,
    lineHeight: 20,
  },
  upgradeButton: {
    backgroundColor: Colors.light.primary,
    borderRadius: Layout.borderRadius.medium,
    height: 55,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginBottom: getSpacing(Layout.spacing.m),
    shadowColor: Colors.light.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  upgradeButtonText: {
    fontFamily: 'Poppins-Bold',
    fontSize: getFontSize(16),
    color: '#FFF',
  },
  skipButton: {
    borderWidth: 2,
    borderColor: Colors.light.primary,
    borderRadius: Layout.borderRadius.medium,
    height: 55,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipButtonText: {
    fontFamily: 'Poppins-Bold',
    fontSize: getFontSize(16),
    color: Colors.light.primary,
  },
  upgradeModalContainer: {
    width: '100%',
    maxWidth: 450,
    maxHeight: height * 0.85,
    backgroundColor: Colors.light.background,
    borderRadius: Layout.borderRadius.large,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
  },
  upgradeContent: {
    padding: getSpacing(Layout.spacing.xl),
    paddingTop: getSpacing(Layout.spacing.xxl),
  },
  upgradeHeader: {
    alignItems: 'center',
    marginBottom: getSpacing(Layout.spacing.xl),
  },
  upgradeSubtitle: {
    fontFamily: 'Poppins-Regular',
    fontSize: getFontSize(14),
    color: Colors.light.subtext,
    textAlign: 'center',
    marginTop: getSpacing(Layout.spacing.s),
  },
  packageCard: {
    backgroundColor: '#F5F5F5',
    borderRadius: Layout.borderRadius.medium,
    padding: getSpacing(Layout.spacing.l),
    marginBottom: getSpacing(Layout.spacing.m),
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  packageCardSelected: {
    borderColor: Colors.light.primary,
    backgroundColor: 'rgba(63, 81, 181, 0.05)',
  },
  packageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: getSpacing(Layout.spacing.m),
  },
  packageName: {
    fontFamily: 'Poppins-Bold',
    fontSize: getFontSize(18),
    color: Colors.light.text,
  },
  packagePrice: {
    fontFamily: 'Poppins-Bold',
    fontSize: getFontSize(18),
    color: Colors.light.primary,
  },
  packageFeature: {
    fontFamily: 'Poppins-Regular',
    fontSize: getFontSize(14),
    color: Colors.light.text,
    marginBottom: getSpacing(Layout.spacing.xs),
    lineHeight: 20,
  },
  selectedBadge: {
    position: 'absolute',
    top: getSpacing(Layout.spacing.m),
    right: getSpacing(Layout.spacing.m),
    backgroundColor: Colors.light.primary,
    borderRadius: 20,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactEmail: {
    fontFamily: 'Poppins-Bold',
    fontSize: getFontSize(14),
    color: Colors.light.primary,
    marginTop: getSpacing(Layout.spacing.m),
    textDecorationLine: 'underline',
  },
});
