import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = "primary",
  size = "md",
  className = "",
  ...props
}) => {
  const baseClasses = "sgr-button";
  const variantClasses = {
    primary: "sgr-button-primary",
    secondary: "sgr-button-secondary",
    ghost: "sgr-button-ghost",
  };
  const sizeClasses = {
    sm: "sgr-button-sm",
    md: "sgr-button-md",
    lg: "sgr-button-lg",
  };

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
