package com.cccmbiz.repository;

import com.cccmbiz.domain.MealPlan;
import com.cccmbiz.domain.MealPlanView;
import io.quarkus.hibernate.orm.panache.PanacheRepository;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.List;

/**
 * Meal IDs (48-56) and event_id (75) are hardcoded to the 2025 conference.
 * Update these values each year before the conference.
 */
@ApplicationScoped
public class MealPlanRepository implements PanacheRepository<MealPlan> {

    private static final String BASE_SQL =
            "SELECT DISTINCT p.household_id As householdId, " +
            "b1.qty As breakfast1, b2.qty As breakfast2, b3.qty As breakfast3, " +
            "d1.qty As dinner1, d2.qty As dinner2, d3.qty As dinner3, " +
            "l1.qty As lunch1, l2.qty As lunch2, l3.qty As lunch3, " +
            "( SELECT price FROM meal WHERE id=51 ) AS breakfastFee, " +
            "( SELECT price FROM meal WHERE id=48) AS dinnerFee, " +
            "( SELECT price FROM meal WHERE id=54) AS lunchFee " +
            "FROM register r " +
            "LEFT JOIN profile p ON p.household_id = r.household_id " +
            "LEFT JOIN register_meal d1 ON d1.register_id = r.id AND d1.meal_id = 48 " +
            "LEFT JOIN register_meal d2 ON d2.register_id = r.id AND d2.meal_id = 49 " +
            "LEFT JOIN register_meal d3 ON d3.register_id = r.id AND d3.meal_id = 50 " +
            "LEFT JOIN register_meal b1 ON b1.register_id = r.id AND b1.meal_id = 51 " +
            "LEFT JOIN register_meal b2 ON b2.register_id = r.id AND b2.meal_id = 52 " +
            "LEFT JOIN register_meal b3 ON b3.register_id = r.id AND b3.meal_id = 53 " +
            "LEFT JOIN register_meal l1 ON l1.register_id = r.id AND l1.meal_id = 54 " +
            "LEFT JOIN register_meal l2 ON l2.register_id = r.id AND l2.meal_id = 55 " +
            "LEFT JOIN register_meal l3 ON l3.register_id = r.id AND l3.meal_id = 56 " +
            "WHERE r.event_id = 75";

    @SuppressWarnings("unchecked")
    public List<MealPlanView> findAllMealPlan() {
        List<Object[]> rows = getEntityManager().createNativeQuery(BASE_SQL).getResultList();
        return rows.stream().map(this::toView).toList();
    }

    @SuppressWarnings("unchecked")
    public List<MealPlanView> findMealPlanByHouseholdId(Integer householdId) {
        List<Object[]> rows = getEntityManager()
                .createNativeQuery(BASE_SQL + " AND p.household_id = ?1")
                .setParameter(1, householdId)
                .getResultList();
        return rows.stream().map(this::toView).toList();
    }

    private MealPlanView toView(Object[] r) {
        MealPlanView v = new MealPlanView();
        v.setHouseholdId(toInt(r[0]));
        v.setBreakfast1(toInt(r[1]));
        v.setBreakfast2(toInt(r[2]));
        v.setBreakfast3(toInt(r[3]));
        v.setDinner1(toInt(r[4]));
        v.setDinner2(toInt(r[5]));
        v.setDinner3(toInt(r[6]));
        v.setLunch1(toInt(r[7]));
        v.setLunch2(toInt(r[8]));
        v.setLunch3(toInt(r[9]));
        v.setBreakfastFee(toDouble(r[10]));
        v.setDinnerFee(toDouble(r[11]));
        v.setLunchFee(toDouble(r[12]));
        return v;
    }

    private Integer toInt(Object o) { return o != null ? ((Number) o).intValue() : null; }
    private Double toDouble(Object o) { return o != null ? ((Number) o).doubleValue() : null; }
}
