import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  TouchableWithoutFeedback,
  Image,
  Platform,
  Alert,
  ActivityIndicator,
  TextInput
} from 'react-native';
import { useRouter } from 'expo-router';
import PaymentWebView from './PaymentWebView';
import PackageTransactionCodeModal from './PackageTransactionCodeModal';
import Colors from '@/constants/Colors';
import { X, Check, Gift, ArrowRight, Shield, Clock, Zap, Crown, Wallet } from 'lucide-react-native';
import { useAuthStore } from '@/stores/authStore';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  withSequence,
  Easing,
  interpolateColor
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

// Get screen dimensions for responsive sizing
const { width, height } = Dimensions.get('window');
const isSmallScreen = width < 360;
const isNarrowScreen = width < 400;

// Helper functions for responsive design
const getFontSize = (baseSize: number): number => {
  if (isSmallScreen) return baseSize - 2;
  if (isNarrowScreen) return baseSize - 1;
  return baseSize;
};

const getSpacing = (baseSpacing: number): number => {
  if (isSmallScreen) return baseSpacing * 0.7;
  if (isNarrowScreen) return baseSpacing * 0.85;
  return baseSpacing;
};

interface WithdrawalPackagesModalProps {
  visible: boolean;
  onClose: () => void;
  onContinueBasic: () => void;
  onUpgradePremium: () => void;
  onUpgradeElite: () => void;
}

export default function WithdrawalPackagesModal({
  visible,
  onClose,
  onContinueBasic,
  onUpgradePremium,
  onUpgradeElite,
}: WithdrawalPackagesModalProps) {
  const router = useRouter();
  const { updateProfile } = useAuthStore();
  
  // Payment states
  const [showPaymentStep, setShowPaymentStep] = useState<'select' | 'payment' | 'processing' | 'success'>('select');
  const [selectedPackage, setSelectedPackage] = useState<'premium' | 'elite' | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentRef, setPaymentRef] = useState('');
  
  // Legacy WebView states (kept for backward compatibility)
  const [showPremiumPaymentWebView, setShowPremiumPaymentWebView] = useState(false);
  const [showElitePaymentWebView, setShowElitePaymentWebView] = useState(false);
  const [showPremiumTransactionModal, setShowPremiumTransactionModal] = useState(false);
  const [showEliteTransactionModal, setShowEliteTransactionModal] = useState(false);
  
  // Animation values
  const contentOpacity = useSharedValue(0);
  const contentTranslateY = useSharedValue(50);
  const liteButtonScale = useSharedValue(1);
  const eliteButtonScale = useSharedValue(1);
  
  // Animated styles
  const contentAnimatedStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentTranslateY.value }]
  }));
  
  const liteButtonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: liteButtonScale.value }]
  }));
  
  const eliteButtonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: eliteButtonScale.value }]
  }));
  
  // Reset and run animations when modal becomes visible
  useEffect(() => {
    if (visible) {
      // Entrance animations
      contentOpacity.value = withTiming(1, { duration: 400 });
      contentTranslateY.value = withSpring(0, { damping: 15 });
    } else {
      // Exit animations
      contentOpacity.value = withTiming(0, { duration: 300 });
      contentTranslateY.value = withTiming(50, { duration: 300 });
    }
  }, [visible]);
  
  // Button press animations
  const handlePremiumButtonPress = () => {
    liteButtonScale.value = withSequence(
      withTiming(0.95, { duration: 100 }),
      withTiming(1, { duration: 100 })
    );
    setSelectedPackage('premium');
    setShowPaymentStep('payment');
  };
  
  const handleEliteButtonPress = () => {
    eliteButtonScale.value = withSequence(
      withTiming(0.95, { duration: 100 }),
      withTiming(1, { duration: 100 })
    );
    setSelectedPackage('elite');
    setShowPaymentStep('payment');
  };

  // Handle package payment initiation
  const handleInitiatePayment = async () => {
    if (!phoneNumber || !selectedPackage) return;
    
    setShowPaymentStep('processing');
    setIsProcessing(true);
    
    try {
      const packagePrices = { premium: 350, elite: 650 };
      const amount = packagePrices[selectedPackage];
      
      const formattedPhone = phoneNumber.startsWith('0') 
        ? '254' + phoneNumber.substring(1)
        : !phoneNumber.startsWith('254') ? '254' + phoneNumber : phoneNumber;

      const response = await fetch('/api/initiate-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phoneNumber: formattedPhone,
          amount: amount,
          description: `${selectedPackage === 'premium' ? 'Premium' : 'Elite'} Package Upgrade`
        })
      });

      const data = await response.json();

      if (data.success) {
        const paymentReference = data.data.requestId || data.data.checkoutRequestId || data.data.transactionRequestId || data.data.externalReference;
        setPaymentRef(paymentReference);
        
        // Start polling for payment status
        pollPackagePaymentStatus(paymentReference);
      } else {
        Alert.alert('Error', 'Failed to initiate payment. Please try again.');
        setShowPaymentStep('payment');
        setIsProcessing(false);
      }
    } catch (error) {
      Alert.alert('Error', 'Network error. Please try again.');
      setShowPaymentStep('payment');
      setIsProcessing(false);
    }
  };

  // Poll package payment status
  const pollPackagePaymentStatus = async (reference: string) => {
    let attempts = 0;
    const maxAttempts = 30;
    
    const poll = async () => {
      try {
        const response = await fetch(`/api/payment-status/${reference}`, {
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
            // Payment successful
            setShowPaymentStep('success');
            setIsProcessing(false);
            
            if (updateProfile) {
              updateProfile({});
            }
            
            return;
          } else if (status === 'failed') {
            Alert.alert('Payment Failed', 'Package upgrade payment failed. Please try again.');
            setShowPaymentStep('payment');
            setIsProcessing(false);
            return;
          }
        }

        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 10000);
        } else {
          Alert.alert('Timeout', 'Payment verification timed out. Please contact support.');
          setShowPaymentStep('payment');
          setIsProcessing(false);
        }
      } catch (error) {
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 10000);
        } else {
          Alert.alert('Error', 'Failed to verify payment. Please contact support.');
          setShowPaymentStep('payment');
          setIsProcessing(false);
        }
      }
    };

    poll();
  };

  // Handle successful payment completion
  const handlePaymentComplete = (packageType: 'premium' | 'elite') => {
    if (packageType === 'premium') {
      setShowPremiumPaymentWebView(false);
      onUpgradePremium();
    } else {
      setShowElitePaymentWebView(false);
      onUpgradeElite();
    }
    onClose();
  };

  return (
    <>
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback>
            <Animated.View style={[styles.modalContainer, contentAnimatedStyle]}>
              <View style={styles.modalHeader}>
                <TouchableOpacity 
                  style={styles.closeButton} 
                  onPress={() => {
                    if (showPaymentStep !== 'select') {
                      setShowPaymentStep('select');
                      setPhoneNumber('');
                    } else {
                      onClose();
                    }
                  }}
                >
                  <X size={24} color="#6B7280" />
                </TouchableOpacity>
                
                <Text style={styles.packagesTitle}>
                  {showPaymentStep === 'select' ? 'Choose Your Package' : 
                   showPaymentStep === 'payment' ? 'Complete Payment' :
                   showPaymentStep === 'processing' ? 'Processing Payment' : 'Payment Successful'}
                </Text>
                <Text style={styles.packagesSubtitle}>
                  {showPaymentStep === 'select' ? 'Upgrade your account to withdraw your full balance and access premium features' :
                   showPaymentStep === 'payment' ? 'Enter your M-Pesa phone number to complete the upgrade' :
                   showPaymentStep === 'processing' ? 'Please complete the M-Pesa payment on your phone' :
                   'Your account has been upgraded successfully'}
                </Text>
              </View>
              
              {showPaymentStep === 'select' && (
              <ScrollView 
                style={styles.packagesScrollView}
                contentContainerStyle={styles.packagesScrollContent}
                showsVerticalScrollIndicator={false}
              >
                {/* Premium Package */}
                <View style={[styles.packageCard, styles.premiumCard]}>
                  <LinearGradient
                    colors={['#5965DE', '#556CD6']}
                    style={styles.packageHeaderGradient}
                  >
                    <Text style={styles.packageName}>Premium Package</Text>
                    <View style={styles.packagePriceContainer}>
                      <Text style={styles.packageCurrency}>KES</Text>
                      <Text style={styles.packagePrice}>350</Text>
                      <Text style={styles.packagePeriod}>for life</Text>
                    </View>
                  </LinearGradient>
                  
                  <View style={styles.packageContent}>
                    {[
                      'Withdraw up to KES 10,000 at once',
                      'Activate your account permanently',
                      'Access to premium surveys (250 KSH each)',
                      'Access to exclusive offers',
                      'Priority customer support'
                    ].map((feature, index) => (
                      <View key={index} style={styles.packageFeatureItem}>
                        <View style={[styles.checkCircle, styles.premiumCheckCircle]}>
                          <Check size={16} color="#FFF" />
                        </View>
                        <Text style={styles.packageFeatureText}>{feature}</Text>
                      </View>
                    ))}
                    
                    <Animated.View style={liteButtonAnimatedStyle}>
                      <TouchableOpacity 
                        style={[styles.packageButton, styles.premiumButton]}
                        onPress={handlePremiumButtonPress}
                      >
                        <Text style={styles.packageButtonText}>Get Premium Package</Text>
                        <ArrowRight size={18} color="#FFF" />
                      </TouchableOpacity>
                    </Animated.View>
                  </View>
                </View>
                
                {/* Elite Package */}
                <View style={[styles.packageCard, styles.eliteCard]}>
                  <LinearGradient
                    colors={['#FF8326', '#FF6B00']}
                    style={styles.packageHeaderGradient}
                  >
                    <Text style={styles.packageName}>Elite Package</Text>
                    <View style={styles.eliteNameContainer}>
                      <View style={styles.eliteBadge}>
                        <Text style={styles.eliteBadgeText}>MOST POPULAR</Text>
                      </View>
                    </View>
                    <View style={styles.packagePriceContainer}>
                      <Text style={styles.packageCurrency}>KES</Text>
                      <Text style={styles.packagePrice}>650</Text>
                      <Text style={styles.packagePeriod}>for life</Text>
                    </View>
                  </LinearGradient>
                  
                  <View style={styles.packageContent}>
                    {[
                      'Withdraw UNLIMITED amounts at once',
                      'Activate your account permanently',
                      'Access to ALL premium surveys',
                      'Exclusive Elite-only surveys (500 KSH each)',
                      'VIP customer support',
                      'Receive double referral bonuses'
                    ].map((feature, index) => (
                      <View key={index} style={styles.packageFeatureItem}>
                        <View style={[styles.checkCircle, styles.eliteCheckCircle]}>
                          <Check size={16} color="#FFF" />
                        </View>
                        <Text style={styles.packageFeatureText}>{feature}</Text>
                      </View>
                    ))}
                    
                    <Animated.View style={eliteButtonAnimatedStyle}>
                      <TouchableOpacity 
                        style={[styles.packageButton, styles.eliteButton]}
                        onPress={handleEliteButtonPress}
                      >
                        <Text style={styles.packageButtonText}>Get Elite Package</Text>
                        <ArrowRight size={18} color="#FFF" />
                      </TouchableOpacity>
                    </Animated.View>
                  </View>
                </View>
                
                <View style={styles.orDivider}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.orText}>OR</Text>
                  <View style={styles.dividerLine} />
                </View>
                
                <TouchableOpacity 
                  style={styles.continueBasicButton}
                  onPress={onContinueBasic}
                >
                  <Text style={styles.continueBasicText}>Continue with Basic Account</Text>
                </TouchableOpacity>
              </ScrollView>
              )}
              
              {showPaymentStep === 'payment' && (
              <ScrollView 
                style={styles.packagesScrollView}
                contentContainerStyle={styles.packagesScrollContent}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.paymentContainer}>
                  <Wallet size={64} color={Colors.light.primary} style={styles.paymentIcon} />
                  
                  <Text style={styles.paymentLabel}>M-Pesa Phone Number</Text>
                  <View style={styles.phoneInputContainer}>
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
                  
                  <TouchableOpacity
                    style={[
                      styles.paymentButton,
                      !phoneNumber && styles.paymentButtonDisabled
                    ]}
                    onPress={handleInitiatePayment}
                    disabled={!phoneNumber}
                  >
                    <Text style={styles.paymentButtonText}>
                      Pay {selectedPackage === 'premium' ? '350' : '650'} KSH & Upgrade
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
              )}
              
              {showPaymentStep === 'processing' && (
              <View style={styles.processingContainer}>
                <ActivityIndicator size={64} color={Colors.light.primary} />
                <Text style={styles.processingTitle}>Processing Payment</Text>
                <Text style={styles.processingSubtitle}>Please complete the M-Pesa payment on your phone</Text>
                <View style={styles.processingInfo}>
                  <Text style={styles.processingText}>Amount: {selectedPackage === 'premium' ? '350' : '650'} KSH</Text>
                  <Text style={styles.processingText}>Phone: +254{phoneNumber}</Text>
                  <Text style={styles.processingText}>Reference: {paymentRef}</Text>
                </View>
              </View>
              )}
              
              {showPaymentStep === 'success' && (
              <View style={styles.successContainer}>
                <Check size={64} color="#4CAF50" />
                <Text style={styles.successTitle}>Upgrade Successful!</Text>
                <Text style={styles.successSubtitle}>Your account now supports instant withdrawals</Text>
                <View style={styles.successInfo}>
                  <Text style={styles.successText}>Your withdrawal request is now under processing. In case of delays, please contact our support team at:</Text>
                  <Text style={styles.contactEmail}>silverstonesolutions103@gmail.com</Text>
                </View>
                <TouchableOpacity
                  style={styles.successButton}
                  onPress={() => {
                    setShowPaymentStep('select');
                    setPhoneNumber('');
                    setSelectedPackage(null);
                    onClose();
                  }}
                >
                  <Text style={styles.successButtonText}>Return to Surveys</Text>
                </TouchableOpacity>
              </View>
              )}
            </Animated.View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>

    {/* Premium Package Payment WebView */}
    <PaymentWebView
      visible={showPremiumPaymentWebView}
      onClose={() => setShowPremiumPaymentWebView(false)}
      uri="https://elite-package-payment.netlify.app/"
      title="Premium Package Payment"
      onSuccess={() => {
        setShowPremiumPaymentWebView(false);
        setShowPremiumTransactionModal(true);
      }}
    />

    {/* Elite Package Payment WebView */}
    <PaymentWebView
      visible={showElitePaymentWebView}
      onClose={() => setShowElitePaymentWebView(false)}
      uri="https://elite-package-payment.netlify.app/"
      title="Elite Package Payment"
      onSuccess={() => {
        setShowElitePaymentWebView(false);
        setShowEliteTransactionModal(true);
      }}
    />
    
    {/* Transaction Verification Modals */}
    <PackageTransactionCodeModal
      visible={showPremiumTransactionModal}
      onClose={() => setShowPremiumTransactionModal(false)}
      onVerificationComplete={(packageType) => {
        setShowPremiumTransactionModal(false);
        onUpgradePremium();
      }}
      packageType="premium"
    />
    
    <PackageTransactionCodeModal
      visible={showEliteTransactionModal}
      onClose={() => setShowEliteTransactionModal(false)}
      onVerificationComplete={(packageType) => {
        setShowEliteTransactionModal(false);
        onUpgradeElite();
      }}
      packageType="elite"
    />
    </>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: getSpacing(16),
  },
  modalContainer: {
    width: '100%',
    maxWidth: 450,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 5,
  },
  modalHeader: {
    padding: getSpacing(24),
    position: 'relative',
  },
  closeButton: {
    position: 'absolute',
    top: getSpacing(16),
    right: getSpacing(16),
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  // Packages Selection styles
  packagesTitle: {
    fontSize: getFontSize(24),
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: getSpacing(8),
    textAlign: 'center',
  },
  packagesSubtitle: {
    fontSize: getFontSize(16),
    color: '#6B7280',
    marginBottom: getSpacing(24),
    textAlign: 'center',
    lineHeight: 24,
  },
  packagesScrollView: {
    width: '100%',
    maxHeight: height * 0.7,
  },
  packagesScrollContent: {
    paddingHorizontal: getSpacing(24),
    paddingBottom: getSpacing(24),
  },
  packageCard: {
    width: '100%',
    borderRadius: 20,
    marginBottom: getSpacing(20),
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    overflow: 'hidden',
  },
  premiumCard: {
    borderWidth: 2,
    borderColor: 'rgba(99, 102, 241, 0.2)',
  },
  eliteCard: {
    borderWidth: 2,
    borderColor: 'rgba(255, 107, 0, 0.2)',
  },
  packageHeaderGradient: {
    padding: getSpacing(20),
    alignItems: 'center',
  },
  packageName: {
    fontSize: getFontSize(18),
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: getSpacing(8),
  },
  eliteNameContainer: {
    alignItems: 'center',
  },
  eliteBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: getSpacing(10),
    paddingVertical: getSpacing(4),
    borderRadius: 12,
    marginTop: getSpacing(4),
  },
  eliteBadgeText: {
    fontSize: getFontSize(12),
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  packagePriceContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  packageCurrency: {
    fontSize: getFontSize(16),
    fontWeight: 'bold',
    color: '#FFFFFF',
    alignSelf: 'flex-start',
    marginTop: getSpacing(6),
  },
  packagePrice: {
    fontSize: getFontSize(36),
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginHorizontal: getSpacing(4),
  },
  packagePeriod: {
    fontSize: getFontSize(14),
    color: 'rgba(255, 255, 255, 0.8)',
    alignSelf: 'flex-end',
    marginBottom: getSpacing(6),
  },
  packageContent: {
    padding: getSpacing(20),
  },
  packageFeatureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: getSpacing(14),
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  premiumCheckCircle: {
    backgroundColor: Colors.light.primary,
  },
  eliteCheckCircle: {
    backgroundColor: '#FF6B00',
  },
  packageFeatureText: {
    fontSize: getFontSize(15),
    color: '#4B5563',
    marginLeft: getSpacing(12),
    flex: 1,
  },
  packageButton: {
    borderRadius: 12,
    paddingVertical: getSpacing(14),
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: getSpacing(8),
  },
  premiumButton: {
    backgroundColor: Colors.light.primary,
    shadowColor: Colors.light.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  eliteButton: {
    backgroundColor: '#FF6B00',
    shadowColor: '#FF6B00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  packageButtonText: {
    fontSize: getFontSize(16),
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginRight: getSpacing(8),
  },
  orDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginVertical: getSpacing(16),
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  orText: {
    fontSize: getFontSize(14),
    color: '#9CA3AF',
    marginHorizontal: getSpacing(12),
  },
  continueBasicButton: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingVertical: getSpacing(14),
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  continueBasicText: {
    fontSize: getFontSize(15),
    color: '#6B7280',
  },
  
  // Payment UI styles
  paymentContainer: {
    alignItems: 'center',
    paddingVertical: getSpacing(32),
    paddingHorizontal: getSpacing(24),
  },
  paymentIcon: {
    marginBottom: getSpacing(24),
  },
  paymentLabel: {
    fontSize: getFontSize(16),
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: getSpacing(12),
    alignSelf: 'flex-start',
  },
  phoneInputContainer: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: getSpacing(12),
    marginBottom: getSpacing(20),
    backgroundColor: '#F9FAFB',
  },
  phonePrefix: {
    fontSize: getFontSize(16),
    fontWeight: '600',
    color: '#6B7280',
    marginRight: getSpacing(4),
  },
  phoneInput: {
    flex: 1,
    paddingVertical: getSpacing(12),
    fontSize: getFontSize(16),
    color: '#1F2937',
  },
  paymentButton: {
    width: '100%',
    backgroundColor: Colors.light.primary,
    borderRadius: 12,
    paddingVertical: getSpacing(14),
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.light.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  paymentButtonDisabled: {
    opacity: 0.5,
  },
  paymentButtonText: {
    fontSize: getFontSize(16),
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  
  // Processing UI styles
  processingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: getSpacing(40),
    paddingHorizontal: getSpacing(24),
  },
  processingTitle: {
    fontSize: getFontSize(20),
    fontWeight: 'bold',
    color: '#1F2937',
    marginTop: getSpacing(20),
    marginBottom: getSpacing(8),
  },
  processingSubtitle: {
    fontSize: getFontSize(14),
    color: '#6B7280',
    marginBottom: getSpacing(24),
    textAlign: 'center',
  },
  processingInfo: {
    width: '100%',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: getSpacing(16),
    marginTop: getSpacing(16),
  },
  processingText: {
    fontSize: getFontSize(14),
    color: '#6B7280',
    marginBottom: getSpacing(8),
  },
  
  // Success UI styles
  successContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: getSpacing(40),
    paddingHorizontal: getSpacing(24),
  },
  successTitle: {
    fontSize: getFontSize(20),
    fontWeight: 'bold',
    color: '#4CAF50',
    marginTop: getSpacing(16),
    marginBottom: getSpacing(8),
  },
  successSubtitle: {
    fontSize: getFontSize(14),
    color: '#6B7280',
    marginBottom: getSpacing(24),
    textAlign: 'center',
  },
  successInfo: {
    width: '100%',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: getSpacing(16),
    marginBottom: getSpacing(24),
  },
  successText: {
    fontSize: getFontSize(14),
    color: '#6B7280',
    marginBottom: getSpacing(12),
    lineHeight: 20,
  },
  contactEmail: {
    fontSize: getFontSize(14),
    fontWeight: 'bold',
    color: Colors.light.primary,
    textDecorationLine: 'underline',
  },
  successButton: {
    width: '100%',
    backgroundColor: Colors.light.primary,
    borderRadius: 12,
    paddingVertical: getSpacing(14),
    alignItems: 'center',
    justifyContent: 'center',
  },
  successButtonText: {
    fontSize: getFontSize(16),
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});
