import * as React from "react"
import { cn } from "../../utils/cn"

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> { }

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
    ({ className, ...props }, ref) => {
        return (
            <select
                className={cn(
                    "input-field ui-select",
                    className
                )}
                ref={ref}
                {...props}
            />
        )
    }
)
Select.displayName = "Select"

export { Select }
