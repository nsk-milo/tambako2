"use client"

import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { motion, AnimatePresence, Variants } from "framer-motion"
import { Prisma } from "@/lib/generated/prisma"
import { useCurrentUser } from "@/hooks/use-current-user"
import { Loader2, CheckCircle, AlertCircle, Check } from "lucide-react"
import axios from "axios"
import { useEffect, useState } from "react"

interface SubscriptionPlan {
  subscription_id: number
  name: string
  description: string
  cost: Prisma.Decimal
  type: string
  features: string[]
  popular?: boolean
}

interface LencoPaymentConfig {
  key: string
  reference: string
  email: string
  amount: number
  currency: string
  channels?: string[]
  customer?: {
    firstName?: string
    lastName?: string
    phone?: string
  }
  onSuccess?: (response: { reference: string }) => void
  onClose?: () => void
  onConfirmationPending?: () => void
}

declare global {
  interface Window {
    LencoPay?: {
      getPaid: (config: LencoPaymentConfig) => void
    }
  }
}

const paymentFormVariants: Variants = {
  hidden: { opacity: 0, y: 50, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: "spring",
      duration: 0.8,
      when: "beforeChildren",
      staggerChildren: 0.1,
    },
  },
  exit: {
    opacity: 0,
    y: 50,
    scale: 0.98,
    transition: { duration: 0.3, ease: "easeInOut" },
  },
}

const formItemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 100 },
  },
}

export default function SubscribePage() {
  const router = useRouter()
  const currentUser = useCurrentUser()
  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null)
  const [phoneNumber, setPhoneNumber] = useState("")
  const [email, setEmail] = useState("")
  const [fullName, setFullName] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("mobile-money")
  const [loading, setLoading] = useState(false)
  const [dialogState, setDialogState] = useState<{
    open: boolean
    title: string
    description: string
    type: "success" | "error"
  } | null>(null)

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const response = await axios.get<Omit<SubscriptionPlan, "features" | "popular">[]>("/api/subscriptions")
        const plansFromServer = response.data || []

        const enhancedData = plansFromServer.map((plan) => {
          if (plan.type === "monthly") {
            return {
              ...plan,
              popular: true,
              features: ["All Content in 4K", "Watch on 4 devices", "Download for offline viewing", "No Ads"],
            }
          }
          if (plan.type === "weekly") {
            return {
              ...plan,
              features: ["All Content in HD", "Watch on 2 devices", "Download for offline viewing"],
            }
          }
          return {
            ...plan,
            features: ["All Content in SD", "Watch on 1 device"],
          }
        })
        setPlans(enhancedData)
      } catch (err) {
        const errorMessage =
          axios.isAxiosError(err) && err.response
            ? err.response.data.error || "Failed to load subscription plans."
            : err instanceof Error
            ? err.message
            : "An unknown error occurred."
        setDialogState({
          open: true,
          title: "Error Loading Plans",
          description: errorMessage,
          type: "error",
        })
      }
    }

    fetchPlans()
  }, [])

  useEffect(() => {
    if (currentUser) {
      setFullName(currentUser.username || "")
      setPhoneNumber(currentUser.phoneNumber || "")
    }
  }, [currentUser])

  const loadLencoScript = async () => {
    if (typeof window === "undefined") return

    if (window.LencoPay) {
      return
    }

    const scriptUrl = process.env.NEXT_PUBLIC_LENCO_WIDGET_URL || "https://pay.sandbox.lenco.co/js/v1/inline.js"

    return new Promise<void>((resolve, reject) => {
      const existingScript = document.querySelector<HTMLScriptElement>("script[data-lenco-payment]")
      if (existingScript) {
        existingScript.addEventListener("load", () => resolve(), { once: true })
        existingScript.addEventListener("error", () => reject(new Error("Unable to load the Lenco payment widget.")), { once: true })
        return
      }

      const script = document.createElement("script")
      script.src = scriptUrl
      script.async = true
      script.setAttribute("data-lenco-payment", "true")
      script.onload = () => resolve()
      script.onerror = () => reject(new Error("Unable to load the Lenco payment widget."))
      document.body.appendChild(script)
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPlan || !phoneNumber || !email || !fullName) {
      setDialogState({
        open: true,
        title: "Missing Information",
        description: "Please select a plan, provide your full name, email, and phone number.",
        type: "error",
      })
      return
    }

    setLoading(true)

    try {
      await loadLencoScript()

      const { data } = await axios.post("/api/payment", {
        action: "initiate",
        amount: Number(selectedPlan.cost),
        email,
        phoneNumber,
        customerName: fullName,
        channels: [paymentMethod],
      })

      if (!data?.publicKey || !data.reference) {
        throw new Error("The payment gateway is not configured correctly.")
      }

      const firstName = fullName.split(" ")[0] || fullName
      const lastName = fullName.split(" ").slice(1).join(" ") || ""

      window.LencoPay?.getPaid({
        key: data.publicKey,
        reference: data.reference,
        email,
        amount: Number(data.amount),
        currency: data.currency || "ZMW",
        channels: data.channels || [paymentMethod],
        customer: {
          firstName,
          lastName,
          phone: phoneNumber,
        },
        onSuccess: async (response) => {
          try {
            const verifyResponse = await axios.post("/api/payment", {
              action: "verify",
              reference: response.reference,
              amount: Number(selectedPlan.cost),
              email,
              phoneNumber,
              customerName: fullName,
              planId: selectedPlan.subscription_id,
            })

            setDialogState({
              open: true,
              title: "Payment Successful",
              description: verifyResponse.data.message || "Your subscription has been activated.",
              type: "success",
            })
            setSelectedPlan(null)
            setEmail("")
            setPhoneNumber(currentUser?.phoneNumber || "")
            setFullName(currentUser?.username || "")
          } catch (err) {
            const errorMessage =
              axios.isAxiosError(err) && err.response
                ? err.response.data.message || "Payment could not be verified."
                : err instanceof Error
                ? err.message
                : "An unknown error occurred."

            setDialogState({
              open: true,
              title: "Payment Verification Failed",
              description: errorMessage,
              type: "error",
            })
          }
        },
        onClose: () => {
          setDialogState({
            open: true,
            title: "Payment Cancelled",
            description: "You closed the payment window before completing the transaction.",
            type: "error",
          })
        },
        onConfirmationPending: () => {
          setDialogState({
            open: true,
            title: "Payment Pending",
            description: "Your payment is being confirmed. We will activate your subscription once it is verified.",
            type: "success",
          })
        },
      })
    } catch (err) {
      const errorMessage =
        axios.isAxiosError(err) && err.response
          ? err.response.data.message || "Payment failed. Please try again."
          : err instanceof Error
          ? err.message
          : "An unknown error occurred."
      setDialogState({
        open: true,
        title: "Payment Failed",
        description: errorMessage,
        type: "error",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Choose Your Plan</h1>
          <p className="text-lg text-muted-foreground">Unlock unlimited streaming. Cancel anytime.</p>
        </div>

        {plans.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
            {plans.map((plan, index) => (
              <motion.div
                key={plan.subscription_id}
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                whileHover={{ y: -5, scale: 1.02 }}
              >
                <Card
                  className={`cursor-pointer transition-all h-full flex flex-col bg-background/30 backdrop-blur-lg ${
                    selectedPlan?.subscription_id === plan.subscription_id
                      ? "border-primary ring-2 ring-primary shadow-lg"
                      : "border border-white/10 hover:border-primary/50"
                  } ${plan.popular ? "relative overflow-hidden" : ""}`}
                  onClick={() => setSelectedPlan(plan)}
                >
                  {plan.popular && (
                    <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs font-bold px-4 py-1 rounded-bl-lg z-10">
                      Most Popular
                    </div>
                  )}
                  <CardHeader>
                    <CardTitle className="text-foreground">{plan.name}</CardTitle>
                    <CardDescription className="text-foreground/80">{plan.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex-grow">
                    <p className="text-4xl font-bold mb-6">
                      K{Number(plan.cost).toFixed(2)}
                      <span className="text-base font-normal text-foreground/80">/{plan.type}</span>
                    </p>
                    <ul className="space-y-2 text-sm text-foreground/80">
                      {plan.features.map((feature, i) => (
                        <li key={i} className="flex items-center">
                          <Check className="h-4 w-4 mr-2 text-green-500" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}

        <AnimatePresence>
          {selectedPlan && (
            <motion.div
              variants={paymentFormVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="max-w-lg mx-auto"
            >
              <Card className="bg-background/30 backdrop-blur-lg border border-white/10">
                <motion.div variants={formItemVariants}>
                  <CardHeader>
                    <CardTitle>Complete Your Payment</CardTitle>
                    <CardDescription className="text-foreground/80">
                      You have selected the <span className="font-semibold text-primary">{selectedPlan.name}</span> plan.
                    </CardDescription>
                  </CardHeader>
                </motion.div>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <motion.div variants={formItemVariants} className="space-y-2">
                      <Label htmlFor="fullName">Full Name</Label>
                      <Input id="fullName" type="text" placeholder="Enter your name" value={fullName} onChange={(e) => setFullName(e.target.value)} required className="bg-transparent" />
                    </motion.div>
                    <motion.div variants={formItemVariants} className="space-y-2">
                      <Label htmlFor="email">Email Address</Label>
                      <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required className="bg-transparent" />
                    </motion.div>
                    <motion.div variants={formItemVariants} className="space-y-2">
                      <Label htmlFor="phoneNumber">Phone Number</Label>
                      <Input id="phoneNumber" type="tel" placeholder="e.g., 0966123456" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} required className="bg-transparent" />
                    </motion.div>
                    <motion.div variants={formItemVariants} className="space-y-2">
                      <Label>Preferred Payment Method</Label>
                      <RadioGroup className="flex gap-4" onValueChange={setPaymentMethod} value={paymentMethod}>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="mobile-money" id="mobile-money" />
                          <Label htmlFor="mobile-money">Mobile Money</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="card" id="card" />
                          <Label htmlFor="card">Card</Label>
                        </div>
                      </RadioGroup>
                    </motion.div>
                    <motion.div variants={formItemVariants}>
                      <Button type="submit" className="w-full" disabled={loading}>
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Pay K{Number(selectedPlan.cost).toFixed(2)}
                      </Button>
                    </motion.div>
                  </form>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {dialogState && (
        <AlertDialog open={dialogState.open}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle
                className={`flex items-center gap-2 ${
                  dialogState.type === "success" ? "text-green-600" : "text-destructive"
                }`}
              >
                {dialogState.type === "success" ? <CheckCircle /> : <AlertCircle />}
                {dialogState.title}
              </AlertDialogTitle>
              <AlertDialogDescription>{dialogState.description}</AlertDialogDescription>
            </AlertDialogHeader>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  )
}