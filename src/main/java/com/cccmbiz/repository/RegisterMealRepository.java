package com.cccmbiz.repository;

import com.cccmbiz.domain.Meal;
import com.cccmbiz.domain.Register;
import com.cccmbiz.domain.RegisterMeal;
import io.quarkus.hibernate.orm.panache.PanacheRepository;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.List;

@ApplicationScoped
public class RegisterMealRepository implements PanacheRepository<RegisterMeal> {

    public RegisterMeal findByRegisterAndMeal(Register register, Meal meal) {
        return find("registerByRegisterId = ?1 and mealByMealId = ?2", register, meal).firstResult();
    }

    public List<RegisterMeal> findByRegister(Register register) {
        return list("registerByRegisterId", register);
    }

    @SuppressWarnings("unchecked")
    public Integer sumQtyByMealId(Integer mealId) {
        Object result = getEntityManager()
                .createNativeQuery("SELECT COALESCE(SUM(qty), 0) FROM register_meal WHERE meal_id = ?1")
                .setParameter(1, mealId)
                .getSingleResult();
        return ((Number) result).intValue();
    }
}
