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

// Mobile money networks Flutterwave settles ZMW through, and the prefixes that
// identify them, so the right one is preselected as the customer types.
const NETWORKS = [
  { value: "MTN", label: "MTN", prefixes: ["96", "76"] },
  { value: "AIRTEL", label: "Airtel", prefixes: ["97", "77"] },
  { value: "ZAMTEL", label: "Zamtel", prefixes: ["95", "75"] },
] as const

type Network = (typeof NETWORKS)[number]["value"]

/** `0966123456`, `+260966123456` and `260966123456` all reduce to `966123456`. */
const toNationalNumber = (phone: string) => {
  const digits = phone.replace(/\D/g, "")
  if (digits.startsWith("260")) return digits.slice(3)
  if (digits.startsWith("0")) return digits.slice(1)
  return digits
}

const detectNetwork = (phone: string): Network | null => {
  const prefix = toNationalNumber(phone).slice(0, 2)
  return NETWORKS.find((network) => network.prefixes.includes(prefix as never))?.value ?? null
}

// What the customer still has to do after the charge is created. Mobile money
// gives us either a hosted authorisation page or a push prompt on the handset.
// https://developer.flutterwave.com/docs/payment-orchestrator-flow
type NextAction =
  | { type: "redirect_url"; redirect_url?: { url?: string } }
  | { type: "payment_instruction"; payment_instruction?: { note?: string } }
  | { type: string }

/** How long to keep asking the server whether the charge cleared. */
const POLL_INTERVAL_MS = 5000
const POLL_TIMEOUT_MS = 3 * 60 * 1000

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

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
  const [network, setNetwork] = useState<Network>("MTN")
  // Set once the customer picks a network by hand, so typing a number no longer
  // overrides their choice.
  const [networkTouched, setNetworkTouched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [awaitingApproval, setAwaitingApproval] = useState<string | null>(null)
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

  // Keep the network in step with the number until the customer overrides it.
  useEffect(() => {
    if (networkTouched) return
    const detected = detectNetwork(phoneNumber)
    if (detected) setNetwork(detected)
  }, [phoneNumber, networkTouched])

  const resetForm = () => {
    setSelectedPlan(null)
    setEmail("")
    setPhoneNumber(currentUser?.phoneNumber || "")
    setFullName(currentUser?.username || "")
    setNetworkTouched(false)
  }

  /**
   * Asks the server to confirm the charge with Flutterwave. A 202 means it has
   * not cleared yet, which is the normal state while the customer is still
   * holding their handset — so keep asking until it resolves or we give up.
   * The `charge.completed` webhook activates the subscription regardless of
   * whether this page is still open.
   */
  const pollForConfirmation = async (reference: string) => {
    const deadline = Date.now() + POLL_TIMEOUT_MS

    while (Date.now() < deadline) {
      try {
        const response = await axios.post(
          "/api/payment",
          { action: "verify", reference },
          { validateStatus: (status) => status === 200 || status === 202 }
        )

        if (response.status === 200) {
          setAwaitingApproval(null)
          setDialogState({
            open: true,
            title: "Payment Successful",
            description: response.data.message || "Your subscription has been activated.",
            type: "success",
          })
          resetForm()
          router.refresh()
          return
        }
      } catch (err) {
        // A dropped request says nothing about the charge — keep polling. Only
        // a real answer from our server (402 declined, 409 mismatch, …) is
        // terminal.
        if (axios.isAxiosError(err) && !err.response) {
          await sleep(POLL_INTERVAL_MS)
          continue
        }

        setAwaitingApproval(null)
        setDialogState({
          open: true,
          title: "Payment Not Completed",
          description:
            axios.isAxiosError(err) && err.response
              ? err.response.data?.message || "Payment could not be verified."
              : err instanceof Error
              ? err.message
              : "An unknown error occurred.",
          type: "error",
        })
        return
      }

      await sleep(POLL_INTERVAL_MS)
    }

    // Out of patience, not necessarily out of luck — the webhook still lands.
    setAwaitingApproval(null)
    setDialogState({
      open: true,
      title: "Still Confirming",
      description:
        "We haven't had confirmation from your provider yet. If the payment went through, your subscription will activate automatically — refresh this page in a few minutes.",
      type: "success",
    })
  }

  /** Acts on what Flutterwave says the customer still has to do. */
  const handleNextAction = (nextAction: NextAction | null, reference: string) => {
    if (nextAction?.type === "redirect_url") {
      const url = (nextAction as { redirect_url?: { url?: string } }).redirect_url?.url
      if (url) {
        // Flutterwave returns the customer to /subscribe/callback?reference=...
        window.location.href = url
        return
      }
    }

    if (nextAction?.type === "payment_instruction") {
      const note = (nextAction as { payment_instruction?: { note?: string } }).payment_instruction
        ?.note
      setAwaitingApproval(
        note || `Approve the payment prompt sent to ${phoneNumber} to activate your subscription.`
      )
    } else {
      setAwaitingApproval("Waiting for your provider to confirm the payment…")
    }

    void pollForConfirmation(reference)
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
      // The server owns the amount: it reads the price off the plan row, creates
      // the Flutterwave charge and returns the reference it recorded for it.
      const { data } = await axios.post("/api/payment", {
        action: "initiate",
        planId: selectedPlan.subscription_id,
        network,
        phoneNumber,
        email,
        fullName,
      })

      if (!data?.reference) {
        throw new Error("The payment gateway is not configured correctly.")
      }

      handleNextAction(data.nextAction ?? null, data.reference)
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
                      <Label htmlFor="phoneNumber">Mobile Money Number</Label>
                      <Input id="phoneNumber" type="tel" placeholder="e.g., 0966123456" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} required className="bg-transparent" />
                    </motion.div>
                    <motion.div variants={formItemVariants} className="space-y-2">
                      <Label>Network</Label>
                      <RadioGroup
                        className="flex gap-4"
                        value={network}
                        onValueChange={(value) => {
                          setNetwork(value as Network)
                          setNetworkTouched(true)
                        }}
                      >
                        {NETWORKS.map((option) => (
                          <div key={option.value} className="flex items-center space-x-2">
                            <RadioGroupItem value={option.value} id={option.value} />
                            <Label htmlFor={option.value}>{option.label}</Label>
                          </div>
                        ))}
                      </RadioGroup>
                    </motion.div>
                    {awaitingApproval && (
                      <motion.div
                        variants={formItemVariants}
                        className="flex items-start gap-3 rounded-md border border-primary/40 bg-primary/10 p-3 text-sm"
                      >
                        <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />
                        <span>{awaitingApproval}</span>
                      </motion.div>
                    )}
                    <motion.div variants={formItemVariants}>
                      <Button type="submit" className="w-full" disabled={loading || !!awaitingApproval}>
                        {(loading || !!awaitingApproval) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Pay K{Number(selectedPlan.cost).toFixed(2)}
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