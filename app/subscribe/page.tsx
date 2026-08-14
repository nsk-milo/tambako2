"use client"

import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { motion, AnimatePresence, Variants } from "framer-motion"
import { useCurrentUser } from "@/hooks/use-current-user"
import { Loader2, CheckCircle, AlertCircle, Check } from "lucide-react"
import axios from "axios"
import { useEffect, useState } from "react"

interface PlanFromServer {
  subscription_id: number
  type: string
  description: string | null
  cost: string
  billing_cycle: "daily" | "weekly" | "monthly"
  duration_count: number
  duration_days: number
  period_label: string
  price_suffix: string
  is_active: boolean
  /** Only set on upgrade options: what the unused days are worth. */
  credit?: number
  /** Only set on upgrade options: the prorated price of moving up now. */
  amount_due?: number
}

interface SubscriptionPlan extends PlanFromServer {
  features: string[]
  popular?: boolean
}

/** The plan the customer is on, when they came here to upgrade. */
interface CurrentPlan {
  subscription_id: number
  type: string
  cost: string
  period_label: string
  end_date: string
  days_remaining: number
}

const FEATURES_BY_CYCLE: Record<PlanFromServer["billing_cycle"], string[]> = {
  monthly: ["All Content in 4K", "Watch on 4 devices", "Download for offline viewing", "No Ads"],
  weekly: ["All Content in HD", "Watch on 2 devices", "Download for offline viewing"],
  daily: ["All Content in SD", "Watch on 1 device"],
}

/** Adds the marketing copy the plan rows do not carry. */
const decoratePlan = (plan: PlanFromServer): SubscriptionPlan => ({
  ...plan,
  popular: plan.billing_cycle === "monthly",
  features: FEATURES_BY_CYCLE[plan.billing_cycle] ?? FEATURES_BY_CYCLE.daily,
})

/** What this plan costs right now — the upgrade price when there is one. */
const payableAmount = (plan: SubscriptionPlan) =>
  plan.amount_due !== undefined ? plan.amount_due : Number(plan.cost)

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
  // Set when the customer arrived from "Upgrade Plan" on their profile.
  const [upgradeMode, setUpgradeMode] = useState(false)
  const [currentPlan, setCurrentPlan] = useState<CurrentPlan | null>(null)
  const [upgradeUnavailable, setUpgradeUnavailable] = useState<string | null>(null)
  const [loadingPlans, setLoadingPlans] = useState(true)
  const [phoneNumber, setPhoneNumber] = useState("")
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
    // Read straight off the URL rather than through useSearchParams, which
    // would force this page behind a Suspense boundary.
    const wantsUpgrade = new URLSearchParams(window.location.search).get("upgrade") === "1"

    /**
     * In upgrade mode the plans come from the upgrade endpoint, which returns
     * only the plans that are a step up and prices each one after crediting the
     * days left on the current plan. If there is nothing to upgrade to, fall
     * back to the ordinary plan list.
     */
    const fetchUpgradeOptions = async () => {
      const { data } = await axios.get<{
        eligible: boolean
        current: CurrentPlan | null
        options: PlanFromServer[]
      }>("/api/subscriptions/upgrade")

      if (!data.eligible) {
        setUpgradeUnavailable(
          data.current
            ? `You are already on our top plan (${data.current.type}). There is nothing higher to move up to.`
            : "You do not have a running subscription to upgrade, so these are our normal prices."
        )
        return false
      }

      setUpgradeMode(true)
      setCurrentPlan(data.current)
      setPlans(data.options.map(decoratePlan))
      return true
    }

    const fetchPlans = async () => {
      const response = await axios.get<PlanFromServer[]>("/api/subscriptions")
      setPlans((response.data || []).map(decoratePlan))
    }

    const load = async () => {
      setLoadingPlans(true)
      try {
        if (wantsUpgrade && (await fetchUpgradeOptions())) return
        await fetchPlans()
      } catch (err) {
        const errorMessage =
          axios.isAxiosError(err) && err.response
            ? err.response.data.error || err.response.data.message || "Failed to load subscription plans."
            : err instanceof Error
            ? err.message
            : "An unknown error occurred."
        setDialogState({
          open: true,
          title: "Error Loading Plans",
          description: errorMessage,
          type: "error",
        })
      } finally {
        setLoadingPlans(false)
      }
    }

    load()
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
    setPhoneNumber(currentUser?.phoneNumber || "")
    setFullName(currentUser?.username || "")
    setNetworkTouched(false)
  }

  /**
   * Asks the server to confirm the charge with Flutterwave. A 202 means it has
   * not cleared yet, which is the normal state while the customer is still
   * holding their handset — so keep asking until it resolves or we give up.
   * Giving up here only stops this page: the server's reconciliation sweep goes
   * on verifying the charge and activates the subscription when it clears.
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

    // Out of patience, not necessarily out of luck — the sweep still catches it.
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
    if (!selectedPlan || !phoneNumber || !fullName) {
      setDialogState({
        open: true,
        title: "Missing Information",
        description: "Please select a plan and provide your full name and phone number.",
        type: "error",
      })
      return
    }

    setLoading(true)

    try {
      // The server owns the amount and the customer's email: it reads the price
      // off the plan row and the email off the account, creates the Flutterwave
      // charge and returns the reference it recorded for it.
      const { data } = await axios.post("/api/payment", {
        action: "initiate",
        planId: selectedPlan.subscription_id,
        network,
        phoneNumber,
        fullName,
        // The server re-prices the upgrade itself; this only asks for it.
        upgrade: upgradeMode,
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
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            {upgradeMode ? "Upgrade Your Plan" : "Choose Your Plan"}
          </h1>
          <p className="text-lg text-muted-foreground">
            {upgradeMode
              ? "Move up now — we take the days left on your current plan off the price."
              : "Unlock unlimited streaming. Cancel anytime."}
          </p>
          {upgradeMode && currentPlan && (
            <p className="mt-4 inline-block rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-sm">
              You are on <span className="font-semibold">{currentPlan.type}</span> with{" "}
              {currentPlan.days_remaining} day{currentPlan.days_remaining === 1 ? "" : "s"} left,
              until {new Date(currentPlan.end_date).toLocaleDateString()}.
            </p>
          )}
          {upgradeUnavailable && (
            <p className="mt-4 inline-block rounded-lg border border-white/10 bg-background/40 px-4 py-2 text-sm text-muted-foreground">
              {upgradeUnavailable}
            </p>
          )}
        </div>

        {loadingPlans && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

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
                    <CardTitle className="text-foreground capitalize">{plan.type}</CardTitle>
                    <CardDescription className="text-foreground/80">
                      {plan.description || `${plan.period_label} of unlimited streaming`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex-grow">
                    <p className="text-4xl font-bold mb-1">
                      K{payableAmount(plan).toFixed(2)}
                      {!upgradeMode && (
                        <span className="text-base font-normal text-foreground/80">
                          /{plan.price_suffix}
                        </span>
                      )}
                    </p>
                    {upgradeMode ? (
                      <p className="mb-6 text-sm text-foreground/80">
                        <span className="line-through">K{Number(plan.cost).toFixed(2)}</span>{" "}
                        after a K{(plan.credit ?? 0).toFixed(2)} credit — then {plan.period_label}{" "}
                        from today.
                      </p>
                    ) : (
                      <p className="mb-6 text-sm text-foreground/80">{plan.period_label} of access</p>
                    )}
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
                    <CardTitle>{upgradeMode ? "Complete Your Upgrade" : "Complete Your Payment"}</CardTitle>
                    <CardDescription className="text-foreground/80">
                      You have selected the{" "}
                      <span className="font-semibold text-primary capitalize">{selectedPlan.type}</span> plan
                      {upgradeMode && selectedPlan.credit !== undefined ? (
                        <>
                          {" "}— K{Number(selectedPlan.cost).toFixed(2)} less a K
                          {selectedPlan.credit.toFixed(2)} credit for the days left on your current
                          plan. It replaces your current plan today and runs for{" "}
                          {selectedPlan.period_label}.
                        </>
                      ) : (
                        <>, which gives you {selectedPlan.period_label} of access.</>
                      )}
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
                        {(loading || !!awaitingApproval) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Pay K{payableAmount(selectedPlan).toFixed(2)}
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
        <AlertDialog
          open={dialogState.open}
          onOpenChange={(open) => {
            if (!open) setDialogState(null)
          }}
        >
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
            <AlertDialogFooter>
              <AlertDialogAction onClick={() => setDialogState(null)}>
                {dialogState.type === "success" ? "Done" : "Close"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  )
}