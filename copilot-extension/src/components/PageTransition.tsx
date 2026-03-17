import { motion } from "framer-motion"
import { type ReactNode } from "react"

interface PageTransitionProps {
    children: ReactNode
    mode?: "fade" | "slide"
}

export function PageTransition({ children, mode = "fade" }: PageTransitionProps) {
    const variants = {
        fade: {
            initial: { opacity: 0 },
            animate: { opacity: 1 },
            exit: { opacity: 0 }
        },
        slide: {
            initial: { x: 20, opacity: 0 },
            animate: { x: 0, opacity: 1 },
            exit: { x: -20, opacity: 0 }
        }
    }

    return (
        <motion.div
            initial="initial"
            animate="animate"
            exit="exit"
            variants={variants[mode]}
            transition={{ duration: 0.2, ease: "easeOut" }}
            style={{ height: "100%", width: "100%" }}
        >
            {children}
        </motion.div>
    )
}
