import * as React from "react"
import { cn } from "../../utils/cn"
import { Input } from "./input"

export interface DatePickerProps
    extends React.InputHTMLAttributes<HTMLInputElement> { }

const DatePicker = React.forwardRef<HTMLInputElement, DatePickerProps>(
    ({ className, ...props }, ref) => {
        return (
            <Input
                type="date"
                className={cn("ui-datepicker", className)}
                ref={ref}
                {...props}
            />
        )
    }
)
DatePicker.displayName = "DatePicker"

export { DatePicker }
