import React, { useState, useRef, useEffect } from "react";

interface CustomSelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

interface CustomSelectProps {
  options: CustomSelectOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  options,
  value,
  onChange,
  disabled = false,
  className = "",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const selectedOption = options.find((opt) => opt.value === value);

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className={`sgr-custom-select ${className} ${isOpen ? "sgr-custom-select-open" : ""} ${disabled ? "sgr-custom-select-disabled" : ""}`}
    >
      <button
        type="button"
        className="sgr-custom-select-button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
      >
        <span className="sgr-custom-select-button-content">
          {selectedOption?.icon && (
            <span className="sgr-custom-select-icon">{selectedOption.icon}</span>
          )}
          <span className="sgr-custom-select-label">
            {selectedOption?.label || value}
          </span>
        </span>
        <svg
          className="sgr-custom-select-arrow"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="currentColor"
        >
          <path d="M6 9L1 4h10z" />
        </svg>
      </button>
      {isOpen && (
        <div className="sgr-custom-select-dropdown">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`sgr-custom-select-option ${
                option.value === value ? "sgr-custom-select-option-selected" : ""
              }`}
              onClick={() => handleSelect(option.value)}
            >
              {option.icon && (
                <span className="sgr-custom-select-option-icon">
                  {option.icon}
                </span>
              )}
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
