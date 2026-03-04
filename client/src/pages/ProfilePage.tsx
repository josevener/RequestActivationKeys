import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { User } from "@/types/user";

export default function ProfilePage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (!storedUser) {
      navigate("/");
      return;
    }
    setUser(JSON.parse(storedUser));
  }, [navigate]);

  if (!user) return null;

  const displayName = user.DisplayName || user.UserName;
  // const avatarLetter = displayName.charAt(0).toUpperCase();

  const handleLogout = () => {
    localStorage.removeItem("user");
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      
      {/* HEADER */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          
          <h1 className="text-lg font-semibold tracking-tight">
            Jeonsoft
          </h1>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div className="flex items-center gap-3 cursor-pointer">
                <div className="hidden sm:block text-right">
                  <p className="text-sm font-medium">{displayName}</p>
                  <p className="text-xs text-muted-foreground">
                    {user.LoginName}
                  </p>
                </div>
                <Avatar>
                  <AvatarFallback>JS</AvatarFallback>
                </Avatar>
              </div>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="max-w-5xl mx-auto px-6 py-10 space-y-10">
        
        {/* Page Title */}
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            Profile Settings
          </h2>
          <p className="text-muted-foreground mt-2">
            Manage your account details and preferences.
          </p>
        </div>

        <Separator />

        {/* Profile Card */}
        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
            <CardDescription>
              Update your profile information.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            
            <div className="grid md:grid-cols-2 gap-6">
              
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input value={displayName} disabled={!editing} />
              </div>

              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={user.Email || ""} disabled={!editing} />
              </div>

              <div className="space-y-2">
                <Label>Department</Label>
                <Input value={user.Department || ""} disabled={!editing} />
              </div>

              <div className="space-y-2">
                <Label>Role</Label>
                <Input value={user.Role || "User"} disabled />
              </div>

            </div>

            <div className="flex justify-end gap-3 pt-4">
              {!editing ? (
                <Button onClick={() => setEditing(true)}>
                  Edit Profile
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={() => setEditing(false)}
                  >
                    Cancel
                  </Button>

                  <Button>
                    <Save className="mr-2 h-4 w-4" />
                    Save Changes
                  </Button>
                </>
              )}
            </div>

          </CardContent>
        </Card>

      </main>
    </div>
  );
}