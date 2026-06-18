package com.cccmbiz.domain;

import jakarta.persistence.*;
import org.hibernate.annotations.Immutable;
import org.hibernate.annotations.Subselect;
import java.util.Objects;

/**
 * Virtual entity — no physical table. Backed by a no-op subselect so Hibernate skips DDL validation.
 * Actual data is assembled via native query in MealPlanRepository.
 */
@Entity
@Immutable
@Subselect(
    "SELECT 0 AS householdId, 0 AS breakfast1, 0 AS breakfast2, 0 AS breakfast3, " +
    "0 AS dinner1, 0 AS dinner2, 0 AS dinner3, " +
    "0 AS lunch1, 0 AS lunch2, 0 AS lunch3, " +
    "0.0 AS breakfastFee, 0.0 AS dinnerFee, 0.0 AS lunchFee FROM register WHERE 1=0"
)
public class MealPlan {
    @Id
    @Column(name = "householdId")   private Integer householdId;
    @Column(name = "breakfast1")    private Integer breakfast1;
    @Column(name = "breakfast2")    private Integer breakfast2;
    @Column(name = "breakfast3")    private Integer breakfast3;
    @Column(name = "dinner1")       private Integer dinner1;
    @Column(name = "dinner2")       private Integer dinner2;
    @Column(name = "dinner3")       private Integer dinner3;
    @Column(name = "lunch1")        private Integer lunch1;
    @Column(name = "lunch2")        private Integer lunch2;
    @Column(name = "lunch3")        private Integer lunch3;
    @Column(name = "breakfastFee")  private Double breakfastFee;
    @Column(name = "dinnerFee")     private Double dinnerFee;
    @Column(name = "lunchFee")      private Double lunchFee;

    public Integer getHouseholdId() { return householdId; }
    public void setHouseholdId(Integer h) { this.householdId = h; }
    public Integer getBreakfast1() { return breakfast1; }
    public void setBreakfast1(Integer v) { this.breakfast1 = v; }
    public Integer getBreakfast2() { return breakfast2; }
    public void setBreakfast2(Integer v) { this.breakfast2 = v; }
    public Integer getBreakfast3() { return breakfast3; }
    public void setBreakfast3(Integer v) { this.breakfast3 = v; }
    public Integer getDinner1() { return dinner1; }
    public void setDinner1(Integer v) { this.dinner1 = v; }
    public Integer getDinner2() { return dinner2; }
    public void setDinner2(Integer v) { this.dinner2 = v; }
    public Integer getDinner3() { return dinner3; }
    public void setDinner3(Integer v) { this.dinner3 = v; }
    public Integer getLunch1() { return lunch1; }
    public void setLunch1(Integer v) { this.lunch1 = v; }
    public Integer getLunch2() { return lunch2; }
    public void setLunch2(Integer v) { this.lunch2 = v; }
    public Integer getLunch3() { return lunch3; }
    public void setLunch3(Integer v) { this.lunch3 = v; }
    public Double getBreakfastFee() { return breakfastFee; }
    public void setBreakfastFee(Double v) { this.breakfastFee = v; }
    public Double getDinnerFee() { return dinnerFee; }
    public void setDinnerFee(Double v) { this.dinnerFee = v; }
    public Double getLunchFee() { return lunchFee; }
    public void setLunchFee(Double v) { this.lunchFee = v; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        return Objects.equals(householdId, ((MealPlan) o).householdId);
    }

    @Override
    public int hashCode() { return Objects.hash(householdId); }
}
