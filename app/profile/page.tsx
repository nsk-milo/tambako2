"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ScrollAnimation } from "@/components/scroll-animation";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import axios from "axios";
import {
  Mail,
  Phone,
  User,
  Loader2,
  Star,
  Calendar,
  ShieldCheck,
  CreditCard,
  XCircle,
  PlusCircle,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Header } from "@/components/header";
import type { UserPayload } from "@/lib/auth";

// NOTE: You'll need to implement `getUserSubscription` in `@/lib/auth.ts`.
// It should take a user ID and return subscription details.

interface Subscription {
  user_subscription_id: string;
  subscriptions: {
    type: string;
    cost: number;
  };
  is_active: boolean;
  end_date: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<UserPayload | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const userResponse = await axios.get("/api/auth/me");
        const userData = userResponse.data.user;
        setUser(userData);

        if (userData?.userId) {
          try {
            const subResponse = await axios.get(
              `/api/user_subscriptions/${userData.userId}`
            );
            setSubscription(subResponse.data);
          } catch (subError) {
            if (axios.isAxiosError(subError) && subError.response?.status === 404) {
              setSubscription(null);
            } else {
              console.error("Failed to fetch subscription", subError);
              setError("Could not load subscription details.");
            }
          }
        }
      } catch (err) {
        console.error("Failed to fetch user data", err);
        setError("Could not load your profile. Please try logging in again.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleCancelSubscription = async () => {
    if (!subscription || !user) return;

    setIsCancelling(true);
    try {
      // We assume the API can handle cancellation by user ID,
      // deactivating the latest active subscription.
      await axios.patch(`/api/user_subscriptions/cancel/${user.userId}`, {
        is_active: false,
      });

      setSubscription((prev) => (prev ? { ...prev, is_active: false } : null));

      toast({
        title: "Subscription Cancelled",
        description: "Your subscription has been successfully cancelled.",
      });
    } catch (error) {
      console.error("Failed to cancel subscription", error);
      toast({
        title: "Cancellation Failed",
        description: "We couldn't cancel your subscription. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCancelling(false);
    }
  };

  const handleAddSubscription = () => {
    router.push("/subscribe");
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);

    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError("New password must be at least 6 characters long.");
      return;
    }

    setIsUpdatingPassword(true);
    try {
      await axios.patch('/api/auth/update-password', {
        currentPassword,
        newPassword,
      });

      toast({
        title: "Password Updated",
        description: "Your password has been successfully updated.",
      });
      // Clear fields
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      const errorMessage = axios.isAxiosError(error) && error.response
        ? error.response.data.message || "Failed to update password."
        : "An unknown error occurred.";
      setPasswordError(errorMessage);
      toast({
        title: "Update Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  return (
    <>
      <div className="min-h-screen">
        <Header user={user} />
        <main className="pt-20 pb-8">
          <div className="container mx-auto px-4">
            <ScrollAnimation className="mb-12">
              <h1 className="text-4xl md:text-5xl font-bold mb-4 text-primary">
                Profile
              </h1>
              <p className="text-lg text-muted-foreground">
                Manage your account settings and preferences.
              </p>
            </ScrollAnimation>

            {isLoading ? (
              <div className="flex justify-center items-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : user ? (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                  <ScrollAnimation delay={200} animation="fade-up">
                    <Card className="w-full border border-white/10 bg-background/30 backdrop-blur-lg transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:border-primary/20">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <User className="w-6 h-6" />
                          Your Information
                        </CardTitle>
                        <CardDescription>
                          This is the information associated with your account.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex items-center gap-4">
                          <User className="w-5 h-5 text-muted-foreground" />
                          <div>
                            <p className="text-sm text-muted-foreground">Username</p>
                            <p className="font-medium">{user.username}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <Mail className="w-5 h-5 text-muted-foreground" />
                          <div>
                            <p className="text-sm text-muted-foreground">Email</p>
                            <p className="font-medium"> Not provided</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <Phone className="w-5 h-5 text-muted-foreground" />
                          <div>
                            <p className="text-sm text-muted-foreground">Phone Number</p>
                            <p className="font-medium">{user.phoneNumber}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </ScrollAnimation>

                  <ScrollAnimation delay={400} animation="fade-up">
                    <Card className="w-full border border-white/10 bg-background/30 backdrop-blur-lg transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:border-primary/20">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Star className="w-6 h-6 text-yellow-500" />
                          Your Subscription
                        </CardTitle>
                        <CardDescription>
                          Details about your current plan and billing.
                        </CardDescription>
                      </CardHeader>
                      {subscription ? (
                        <>
                          <CardContent className="space-y-4">
                            <div className="flex items-center gap-4">
                              <ShieldCheck className="w-5 h-5 text-muted-foreground" />
                              <div>
                                <p className="text-sm text-muted-foreground">Plan</p>
                                <p className="font-medium">
                                  {subscription.subscriptions.type}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <CreditCard className="w-5 h-5 text-muted-foreground" />
                              <div>
                                <p className="text-sm text-muted-foreground">Price</p>
                                <p className="font-medium">
                                  K{subscription.subscriptions.cost} / {subscription.subscriptions.type}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <Calendar className="w-5 h-5 text-muted-foreground" />
                              <div>
                                <p className="text-sm text-muted-foreground">Status</p>
                                <p className={`font-medium ${subscription.is_active ? 'text-green-500' : 'text-red-500'}`}>
                                  {subscription.is_active ? 'Active' : 'Inactive'}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <Calendar className="w-5 h-5 text-muted-foreground" />
                              <div>
                                <p className="text-sm text-muted-foreground">Renews on</p>
                                <p className="font-medium">{new Date(subscription.end_date).toLocaleDateString()}</p>
                              </div>
                            </div>
                          </CardContent>
                          <CardFooter>
                            {subscription.is_active ? (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="destructive">
                                    <XCircle className="mr-2 h-4 w-4" />
                                    Cancel Subscription
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This action will cancel your subscription at the end of your current billing period. You can resubscribe at any time.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Keep Subscription</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleCancelSubscription} disabled={isCancelling}>
                                      {isCancelling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                      {isCancelling ? 'Cancelling...' : 'Confirm Cancellation'}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            ) : (
                              <Button onClick={handleAddSubscription}><PlusCircle className="mr-2 h-4 w-4" />Resubscribe</Button>
                            )}
                          </CardFooter>
                        </>
                      ) : (
                        <CardContent className="pt-4">
                          <p className="text-muted-foreground">You do not have an active subscription.</p>
                          <Button onClick={handleAddSubscription} className="mt-4"><PlusCircle className="mr-2 h-4 w-4" />Subscribe Now</Button>
                        </CardContent>
                      )}
                    </Card>
                  </ScrollAnimation>
                </div>
                <div className="mt-8 lg:col-span-2">
                  <ScrollAnimation delay={600} animation="fade-up">
                    <Card className="w-full border border-white/10 bg-background/30 backdrop-blur-lg">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Lock className="w-6 h-6" />
                          Change Password
                        </CardTitle>
                        <CardDescription>
                          Update your password here. It's a good practice to use a strong password.
                        </CardDescription>
                      </CardHeader>
                      <form onSubmit={handleUpdatePassword}>
                        <CardContent className="space-y-6">
                          {passwordError && (
                            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
                              <AlertCircle className="h-4 w-4" />
                              <p>{passwordError}</p>
                            </div>
                          )}
                          <div className="space-y-2">
                            <Label htmlFor="currentPassword">Current Password</Label>
                            <div className="relative">
                              <Input id="currentPassword" type={showCurrentPassword ? "text" : "password"} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required className="bg-transparent pr-10" />
                              <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => setShowCurrentPassword(!showCurrentPassword)}>
                                {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </Button>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="newPassword">New Password</Label>
                            <div className="relative">
                              <Input id="newPassword" type={showNewPassword ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required className="bg-transparent pr-10" />
                              <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => setShowNewPassword(!showNewPassword)}>
                                {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </Button>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="confirmPassword">Confirm New Password</Label>
                            <div className="relative">
                              <Input id="confirmPassword" type={showConfirmPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required className="bg-transparent pr-10" />
                              <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
                                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                        <CardFooter>
                          <Button type="submit" disabled={isUpdatingPassword} className="mt-5">
                            {isUpdatingPassword ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            {isUpdatingPassword ? 'Updating...' : 'Update Password'}
                          </Button>
                        </CardFooter>
                      </form>
                    </Card>
                  </ScrollAnimation>
                </div>
              </>
            ) : (
              <div className="text-center py-12">
                <p className="text-muted-foreground">Please log in to view your profile.</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </>
  );
}
